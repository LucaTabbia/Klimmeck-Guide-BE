import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import {
    isRegistered,
    QuestRequirementsSnapshot,
    registrationRuleOf,
} from 'src/quests/acceptance/quest-eligibility';
import {
    lanePathOf,
    laneOf,
    QuestLane,
} from 'src/quests/acceptance/quest-lanes';
import { StaleResolution } from 'src/quests/outcomes/outcome-writer.service';
import { QuestResolutionScheduler } from 'src/quests/outcomes/scheduling/quest-resolution.scheduler';
import {
    partyClaimFilter,
    PartyMember,
    partyReadinessOf,
    registeredIdsOf,
} from './party-rules';

export type StartOutcome = 'started' | 'waiting' | 'stale';

export interface StartTrigger {
    questId: Types.ObjectId;
    pendingQuestId?: Types.ObjectId;
}

interface StartQuestSnapshot {
    _id: Types.ObjectId;
    infos: { type: QuestType };
    requirements?: QuestRequirementsSnapshot | null;
    registeredAdventurers?: { character?: unknown }[] | null;
    concludedAt?: Date | null;
    startedAt?: Date | null;
}

interface MemberPendingQuest {
    _id: Types.ObjectId;
    arrivedAt?: Date | null;
    waitingTime?: number | null;
}

interface PartyRead {
    members: PartyMember[];
    dropped: Types.ObjectId[];
}

const START_QUEST_PROJECTION = {
    'infos.type': 1,
    requirements: 1,
    registeredAdventurers: 1,
    concludedAt: 1,
    startedAt: 1,
} as const;

const STANDARD_LANE_PATH = lanePathOf(QuestLane.standard);

// unico scrittore di startDate della corsia standard e unico punto che accoda i job di risoluzione (D-24 emendata 2026-10-25)
@Injectable()
export class QuestStartService {
    private readonly logger = new Logger(QuestStartService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly scheduler: QuestResolutionScheduler,
    ) {}

    // unico ingresso dopo un commit (accettazione, arrivo, sweep): un errore qui non annulla quanto già scritto, lo sweep riprova
    async tryStart(trigger: StartTrigger): Promise<StartOutcome> {
        try {
            return await this.start(trigger);
        } catch (error) {
            this.logger.error(
                `Avvio della missione ${trigger.questId.toHexString()} (missione in attesa ${trigger.pendingQuestId?.toHexString() ?? '-'}) fallito: ${describeError(error)}; lo sweep riprova`,
            );
            return 'stale';
        }
    }

    private async start(trigger: StartTrigger): Promise<StartOutcome> {
        const quest = await this.questModel
            .findById(trigger.questId, START_QUEST_PROJECTION)
            .lean<StartQuestSnapshot | null>()
            .exec();
        if (!quest) {
            this.logger.warn(
                `Missione ${trigger.questId.toHexString()} inesistente: nessun avvio`,
            );
            return 'stale';
        }
        // story e worldMission cominciano all'accettazione e non scadono (Phase 7 D-16, D-03)
        if (laneOf(quest.infos.type) !== QuestLane.standard) return 'stale';
        if (!isRegistered(quest.infos.type)) return this.startSingle(trigger);
        return this.startParty(quest);
    }

    // hunt, dungeon, job, heal, study: l'avvio coincide con l'arrivo (D-13)
    private async startSingle(trigger: StartTrigger): Promise<StartOutcome> {
        if (!trigger.pendingQuestId) return 'stale';
        const started = await this.pendingQuestModel
            .findOneAndUpdate(
                {
                    _id: trigger.pendingQuestId,
                    quest: { $in: idForms(trigger.questId) },
                    startDate: null,
                    arrivedAt: { $ne: null },
                },
                [{ $set: { startDate: '$arrivedAt' } }],
                {
                    returnDocument: 'after',
                    projection: { startDate: 1, waitingTime: 1 },
                },
            )
            .lean<{ startDate: Date; waitingTime?: number | null } | null>()
            .exec();
        if (!started) return 'stale';
        await this.scheduler.scheduleResolution({
            pendingQuestId: trigger.pendingQuestId,
            startDate: started.startDate,
            waitingTime: started.waitingTime ?? 0,
        });
        return 'started';
    }

    // utente 2026-10-25: "per poterle cominciare il party dev'essere al completo, quindi tutti restano in attesa"
    private async startParty(quest: StartQuestSnapshot): Promise<StartOutcome> {
        if (quest.concludedAt != null || quest.startedAt != null)
            return 'stale';
        const rule = registrationRuleOf(quest.infos.type, quest.requirements);
        if (rule === null || rule === 'invalid') {
            this.logger.warn(
                `Missione ${quest._id.toHexString()} con requiredAdventurers non valido: nessun avvio`,
            );
            return 'stale';
        }
        const { members, dropped } = await this.readParty(quest);
        if (dropped.length > 0)
            return this.dropIncoherent(quest._id, members, dropped);
        const readiness = partyReadinessOf(rule.total, members);
        if (readiness.state !== 'ready') return 'waiting';
        return this.commitStart(quest._id, members, readiness.startDate);
    }

    // un difetto di dati non blocca il gruppo (Pitfall 8, come questUpdateOf): il posto torna libero, il party si riempie o scade a 24 ore.
    // claim per identità e $pull nello stesso update atomico, startedAt non scritto; dopo il $pull il WARN non si ripete
    private async dropIncoherent(
        questId: Types.ObjectId,
        members: readonly PartyMember[],
        dropped: readonly Types.ObjectId[],
    ): Promise<StartOutcome> {
        const registered = [
            ...members.map(({ characterId }) => characterId),
            ...dropped,
        ];
        const { modifiedCount } = await this.questModel
            .updateOne(partyClaimFilter(questId, registered), {
                $pull: {
                    registeredAdventurers: {
                        character: {
                            $in: dropped.flatMap((id) => idForms(id)),
                        },
                    },
                },
            })
            .exec();
        if (modifiedCount === 0) return 'stale';
        this.logger.warn(
            `Missione ${questId.toHexString()}: registrati senza una missione in attesa coerente (${dropped.map((id) => id.toHexString()).join(', ')}) rimossi dal party`,
        );
        return 'waiting';
    }

    // stessi filtri del roster di gruppo (ResolutionLoader.readGroupRoster): registrati attivi in corsia standard con una PendingQuest di questa quest
    private async readParty(quest: StartQuestSnapshot): Promise<PartyRead> {
        const registered = registeredIdsOf(quest.registeredAdventurers);
        const characters = await this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    _id: { $in: registered.flatMap((id) => idForms(id)) },
                    [STANDARD_LANE_PATH]: { $ne: null },
                },
                { [STANDARD_LANE_PATH]: 1 },
            )
            .lean<
                { _id: Types.ObjectId; quests?: { pendingQuest?: unknown } }[]
            >()
            .exec();
        const lanes = characters.flatMap(
            (character) => refIdOf(character.quests?.pendingQuest) ?? [],
        );
        const pendingQuests = await this.pendingQuestModel
            .find(
                { _id: { $in: lanes }, quest: { $in: idForms(quest._id) } },
                { arrivedAt: 1, waitingTime: 1 },
            )
            .lean<MemberPendingQuest[]>()
            .exec();
        const members: PartyMember[] = [];
        const dropped: Types.ObjectId[] = [];
        for (const characterId of registered) {
            const character = characters.find(({ _id }) =>
                _id.equals(characterId),
            );
            const lane = refIdOf(character?.quests?.pendingQuest);
            const pendingQuest = pendingQuests.find(
                ({ _id }) => lane !== null && _id.equals(lane),
            );
            if (!pendingQuest) {
                dropped.push(characterId);
                continue;
            }
            members.push({
                characterId,
                pendingQuestId: pendingQuest._id,
                arrivedAt: pendingQuest.arrivedAt ?? null,
                waitingTime: pendingQuest.waitingTime ?? 0,
            });
        }
        return { members, dropped };
    }

    // claim per identità nella stessa transazione dell'updateMany (T-09-90): stesso startDate per tutti; job solo dopo il commit
    private async commitStart(
        questId: Types.ObjectId,
        members: readonly PartyMember[],
        startDate: Date,
    ): Promise<StartOutcome> {
        try {
            await this.connection.transaction(async (session) => {
                const claimed = await this.questModel
                    .findOneAndUpdate(
                        partyClaimFilter(
                            questId,
                            members.map(({ characterId }) => characterId),
                        ),
                        { $set: { startedAt: startDate } },
                        { session, projection: { _id: 1 } },
                    )
                    .lean()
                    .exec();
                if (!claimed) throw new StaleResolution();
                await this.pendingQuestModel
                    .updateMany(
                        {
                            _id: {
                                $in: members.map(
                                    ({ pendingQuestId }) => pendingQuestId,
                                ),
                            },
                            startDate: null,
                        },
                        { $set: { startDate } },
                        { session },
                    )
                    .exec();
            });
        } catch (error) {
            if (error instanceof StaleResolution) return 'stale';
            throw error;
        }
        for (const { pendingQuestId, waitingTime } of members) {
            await this.scheduler.scheduleResolution({
                pendingQuestId,
                startDate,
                waitingTime,
            });
        }
        return 'started';
    }
}
