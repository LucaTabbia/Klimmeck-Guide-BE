import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
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
import { idForms, objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import {
    GM_LANES,
    type GmLane,
    isGmLane,
    isStandardLaneBusy,
    laneOf,
    lanePathOf,
    QuestLane,
} from 'src/quests/acceptance/quest-lanes';
import { OUTCOME_CHARACTER_PROJECTION } from './outcome-plan';
import {
    type LaneCharacter,
    type PendingQuestSnapshot,
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionQuest,
} from './resolution-loader.service';

type GmLaneCharacter = LaneCharacter<GmLane>;

export interface GmSeat {
    character: ResolutionCharacter;
    pendingQuestId: Types.ObjectId;
    ownerId: Types.ObjectId;
    resultId: Types.ObjectId;
}

export interface GmRequest {
    quest: ResolutionQuest;
    lane: GmLane;
    seats: GmSeat[];
}

interface StandardLaneHolder {
    quests?: { pendingQuest?: unknown } | null;
}

// un partecipante con la corsia standard occupata blocca l'intera richiesta (D-24): nessun esito parziale
export function assertNoBusyParticipant(
    characters: readonly StandardLaneHolder[],
): void {
    if (characters.some(({ quests }) => isStandardLaneBusy(quests)))
        throw GameRuleException.participantQuestInProgress();
}

// l'unica lettura di una richiesta del GM: qualunque PendingQuest del gruppo porta alla quest, alla corsia e ai posti attivi
@Injectable()
export class GmRequestReader {
    private readonly logger = new Logger(GmRequestReader.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly loader: ResolutionLoader,
    ) {}

    // solo le corsie del GM: una PendingQuest standard, inesistente o malformata è NOT_FOUND (T-09-77)
    async read(pendingQuestHex: string): Promise<GmRequest> {
        const pendingQuestId = objectIdFromHex(pendingQuestHex);
        if (!pendingQuestId) throw ResourceNotFoundException.pendingQuest();
        const pendingQuest = await this.pendingQuestModel
            .findById(pendingQuestId, { quest: 1 })
            .lean<PendingQuestSnapshot | null>()
            .exec();
        if (!pendingQuest) throw ResourceNotFoundException.pendingQuest();
        const holder = await this.characterModel
            .findOne(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    $or: GM_LANES.map((lane) => ({
                        [lanePathOf(lane)]: { $in: idForms(pendingQuestId) },
                    })),
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<GmLaneCharacter | null>()
            .exec();
        if (!holder) throw ResourceNotFoundException.pendingQuest();
        const quest = await this.loader.readQuest(pendingQuest);
        const lane = quest ? laneOf(quest.infos.type) : QuestLane.standard;
        if (!quest || !isGmLane(lane))
            throw ResourceNotFoundException.pendingQuest();
        const holders =
            lane === QuestLane.worldMission
                ? await this.worldMissionHolders(quest._id)
                : [holder];
        const seats = await this.seatsOf(holders, lane);
        if (seats.length === 0) throw ResourceNotFoundException.pendingQuest();
        return { quest, lane, seats };
    }

    // completamento concorrente già committato: il perdente vede la richiesta sparita (T-09-76)
    // il perdente di una gara con un'accettazione standard non vede NOT_FOUND (D-24)
    async lostCompletionError(request: GmRequest): Promise<Error> {
        const participants = await this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    _id: {
                        $in: request.seats.map(
                            ({ character }) => character._id,
                        ),
                    },
                },
                { 'quests.pendingQuest': 1 },
            )
            .lean<StandardLaneHolder[]>()
            .exec();
        return participants.some(({ quests }) => isStandardLaneBusy(quests))
            ? GameRuleException.participantQuestInProgress()
            : ResourceNotFoundException.pendingQuest();
    }

    // tutti i personaggi attivi con una PendingQuest di questa worldMission nella propria corsia (D-04, D-06)
    private async worldMissionHolders(
        questId: Types.ObjectId,
    ): Promise<GmLaneCharacter[]> {
        const pendingQuests = await this.pendingQuestModel
            .find({ quest: { $in: idForms(questId) } }, { _id: 1 })
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        return this.characterModel
            .find(
                {
                    ...ACTIVE_CHARACTER_FILTER,
                    [lanePathOf(QuestLane.worldMission)]: {
                        $in: pendingQuests.flatMap(({ _id }) => idForms(_id)),
                    },
                },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<GmLaneCharacter[]>()
            .exec();
    }

    // un partecipante senza proprietario non ha a chi consegnare il risultato: escluso con un WARN di soli id
    private async seatsOf(
        holders: readonly GmLaneCharacter[],
        lane: GmLane,
    ): Promise<GmSeat[]> {
        const owners = await this.loader.ownersOf(
            holders.map(({ _id }) => _id),
        );
        return holders.flatMap((character) => {
            const pendingQuestId = refIdOf(character.quests?.[lane]);
            const ownerId = owners.get(character._id.toHexString());
            if (!pendingQuestId) return [];
            if (!ownerId) {
                this.logger.warn(
                    `Personaggio ${character._id.toHexString()} della missione in attesa ${pendingQuestId.toHexString()} senza proprietario: escluso dal completamento`,
                );
                return [];
            }
            return [
                {
                    character,
                    pendingQuestId,
                    ownerId,
                    resultId: new Types.ObjectId(),
                },
            ];
        });
    }
}
