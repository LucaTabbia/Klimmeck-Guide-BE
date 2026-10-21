import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { WalletService } from 'src/economy/wallet.service';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import {
    capacityRuleOf,
    CharacterEligibilitySnapshot,
    classifyEligibility,
    isRepeatable,
    isShared,
    pointsCostOf,
    QuestEligibilitySnapshot,
    waitingTimeOf,
} from './quest-eligibility';
import {
    classifyUnclaimed,
    classifyUnregistered,
    laneClaimFilter,
    laneClaimUpdate,
    LaneClaimSnapshot,
    registrationFilter,
    registrationUpdate,
    UnclaimedSnapshot,
    UnregisteredSnapshot,
} from './quest-acceptance.updates';
import { laneOf, QuestLane } from './quest-lanes';

export interface AcceptQuestCommand {
    ownerId: Types.ObjectId;
    characterId: Types.ObjectId;
    questId: Types.ObjectId;
}

interface QuestAcceptanceSnapshot extends QuestEligibilitySnapshot {
    infos: {
        type: QuestType;
        markerLocation?: unknown;
        timeToComplete?: number | null;
    };
}

interface CharacterAcceptanceSnapshot extends CharacterEligibilitySnapshot {
    status: { title: TitleType; location?: unknown };
}

interface LaneClaim {
    characterId: Types.ObjectId;
    lane: QuestLane;
    claim: LaneClaimSnapshot;
    questId: Types.ObjectId;
    repeatable: boolean;
    pendingQuestId: Types.ObjectId;
}

const QUEST_PROJECTION = {
    'infos.type': 1,
    'infos.markerLocation': 1,
    'infos.timeToComplete': 1,
    requirements: 1,
    registrations: 1,
    registeredAdventurers: 1,
};

const CHARACTER_PROJECTION = {
    'status.title': 1,
    'status.location': 1,
    quests: 1,
};

@Injectable()
export class QuestAcceptanceService {
    private readonly logger = new Logger(QuestAcceptanceService.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly wallet: WalletService,
    ) {}

    // pre-letture lean → regole pure → una transazione con le guard riaffermate nel filtro (07 D-18): un rifiuto non scrive nulla
    async accept({
        ownerId,
        characterId,
        questId,
    }: AcceptQuestCommand): Promise<Types.ObjectId> {
        const quest = await this.readQuest(questId);
        const lane = laneOf(quest.infos.type);
        const cost = this.costOrReject(quest, lane);
        const character = await this.readCharacter(characterId);
        const rejection = classifyEligibility(quest, character, lane);
        if (rejection) throw rejection;
        const claim: LaneClaimSnapshot = {
            title: character.status.title,
            location: await this.locationInQuestCity(quest, character),
        };
        const repeatable = isRepeatable(quest.infos.type);
        const pendingQuestId = new Types.ObjectId();
        await this.connection.transaction(async (session) => {
            await this.claimLane(
                {
                    characterId,
                    lane,
                    claim,
                    questId,
                    repeatable,
                    pendingQuestId,
                },
                session,
            );
            if (isShared(quest.infos.type))
                await this.register(quest, characterId, claim.title, session);
            await this.pendingQuestModel.create(
                [
                    {
                        _id: pendingQuestId,
                        startDate: new Date(),
                        waitingTime: waitingTimeOf(
                            lane,
                            quest.infos.timeToComplete,
                        ),
                        pointsSpent: cost,
                        quest: questId,
                    },
                ],
                { session },
            );
            if (cost > 0)
                await this.wallet.debitUserPoints(ownerId, cost, session);
        });
        return pendingQuestId;
    }

    private async readQuest(
        questId: Types.ObjectId,
    ): Promise<QuestAcceptanceSnapshot> {
        const quest = await this.questModel
            .findById(questId, QUEST_PROJECTION)
            .lean<QuestAcceptanceSnapshot | null>()
            .exec();
        if (!quest) throw ResourceNotFoundException.quest();
        return quest;
    }

    // prima della transazione: l'importo non valido del wallet resta irraggiungibile (Pitfall 6); nel log solo id e corsia
    private costOrReject(
        quest: QuestAcceptanceSnapshot,
        lane: QuestLane,
    ): number {
        const points = pointsCostOf(lane, quest.requirements?.requiredPoints);
        if (points !== 'invalid') return points.cost;
        this.logger.warn(
            `Missione ${quest._id.toHexString()} non accettabile: requiredPoints non valido per la corsia ${lane}`,
        );
        throw GameRuleException.questNotAcceptable();
    }

    private async readCharacter(
        characterId: Types.ObjectId,
    ): Promise<CharacterAcceptanceSnapshot> {
        const character = await this.characterModel
            .findOne(activeCharacterById(characterId), CHARACTER_PROJECTION)
            .lean<CharacterAcceptanceSnapshot | null>()
            .exec();
        if (!character) throw ResourceNotFoundException.character();
        return character;
    }

    private locationInQuestCity(
        _quest: QuestAcceptanceSnapshot,
        character: CharacterAcceptanceSnapshot,
    ): Promise<Types.ObjectId> {
        const location = refIdOf(character.status.location);
        if (!location) throw GameRuleException.questNotInCity();
        return Promise.resolve(location);
    }

    private async claimLane(
        {
            characterId,
            lane,
            claim,
            questId,
            repeatable,
            pendingQuestId,
        }: LaneClaim,
        session: ClientSession,
    ): Promise<void> {
        const claimed = await this.characterModel
            .findOneAndUpdate(
                laneClaimFilter(characterId, lane, claim, questId, repeatable),
                laneClaimUpdate(lane, pendingQuestId),
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (claimed) return;
        const fresh = await this.characterModel
            .findOne(activeCharacterById(characterId), CHARACTER_PROJECTION)
            .session(session)
            .lean<UnclaimedSnapshot | null>()
            .exec();
        throw classifyUnclaimed(fresh, lane, claim, questId, repeatable);
    }

    private async register(
        quest: QuestAcceptanceSnapshot,
        characterId: Types.ObjectId,
        title: TitleType,
        session: ClientSession,
    ): Promise<void> {
        const rule = capacityRuleOf(quest.requirements, title);
        const registered = await this.questModel
            .findOneAndUpdate(
                registrationFilter(quest._id, characterId, rule),
                registrationUpdate(characterId, title),
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (registered) return;
        const fresh = await this.questModel
            .findById(quest._id, { registrations: 1, registeredAdventurers: 1 })
            .session(session)
            .lean<UnregisteredSnapshot | null>()
            .exec();
        throw classifyUnregistered(fresh, characterId);
    }
}

// i ref sui path Mixed arrivano come ObjectId o, da dati legacy, come stringa esadecimale (04 Pitfall 1)
function refIdOf(value: unknown): Types.ObjectId | null {
    return value instanceof Types.ObjectId
        ? value
        : objectIdFromHex(typeof value === 'string' ? value : null);
}
