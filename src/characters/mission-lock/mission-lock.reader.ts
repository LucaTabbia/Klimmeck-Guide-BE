// una sola regola (D-12, D-13): il reader legge, il predicato puro decide; corsa di millisecondi fra controllo e scrittura accettata (D-23)
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { idForms, isObjectId, refIdOf } from 'src/mongo/document-id';
import {
    lanePathOf,
    QUEST_LANES,
    QuestLane,
} from 'src/quests/acceptance/quest-lanes';
import {
    guidedMissionInProgressOf,
    LockLane,
    LockLanes,
    missionInProgressOf,
} from './mission-lock';

interface LaneRefs {
    quests?: Partial<Record<QuestLane, unknown>> | null;
}

interface LaneDates extends LockLane {
    _id: Types.ObjectId;
}

const LANE_PROJECTION = Object.fromEntries(
    QUEST_LANES.map((lane) => [lanePathOf(lane), 1]),
);

@Injectable()
export class MissionLockReader {
    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
    ) {}

    async lanesOf(
        characterId: Types.ObjectId,
        session?: ClientSession | null,
    ): Promise<LockLanes | null> {
        const character = await this.characterModel
            .findOne(
                { ...ACTIVE_CHARACTER_FILTER, _id: characterId },
                LANE_PROJECTION,
            )
            .session(session ?? null)
            .lean<LaneRefs>()
            .exec();
        if (!character) return null;

        const refs = new Map(
            QUEST_LANES.map((lane) => [
                lane,
                refIdOf(character.quests?.[lane]),
            ]),
        );
        const pendingQuestIds = [...refs.values()].filter(isObjectId);
        const dates = pendingQuestIds.length
            ? await this.pendingQuestModel
                  .find(
                      { _id: { $in: pendingQuestIds } },
                      { startDate: 1, missionDraftStartedAt: 1 },
                  )
                  .session(session ?? null)
                  .lean<LaneDates[]>()
                  .exec()
            : [];

        const laneOf = (lane: QuestLane): LockLane | null => {
            const id = refs.get(lane);
            return id
                ? (dates.find(({ _id }) => _id.equals(id)) ?? null)
                : null;
        };
        return {
            pendingQuest: laneOf(QuestLane.standard),
            activeStoryQuest: laneOf(QuestLane.story),
            activeWorldMissionQuest: laneOf(QuestLane.worldMission),
        };
    }

    async isLocked(
        characterId: Types.ObjectId,
        session?: ClientSession | null,
    ): Promise<boolean> {
        return missionInProgressOf(await this.lanesOf(characterId, session));
    }

    async isGuidedLocked(
        characterId: Types.ObjectId,
        session?: ClientSession | null,
    ): Promise<boolean> {
        return guidedMissionInProgressOf(
            await this.lanesOf(characterId, session),
        );
    }

    async assertFree(
        characterId: Types.ObjectId,
        session?: ClientSession | null,
    ): Promise<void> {
        if (await this.isLocked(characterId, session)) {
            throw GameRuleException.missionInProgress();
        }
    }

    async hasOpenDraft(
        questId: Types.ObjectId,
        session?: ClientSession | null,
    ): Promise<boolean> {
        const draft = await this.pendingQuestModel
            .exists({
                quest: { $in: idForms(questId) },
                missionDraftStartedAt: { $ne: null },
            })
            .session(session ?? null)
            .exec();
        return draft !== null;
    }
}
