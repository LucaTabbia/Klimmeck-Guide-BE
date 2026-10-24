import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { WalletService } from 'src/economy/wallet.service';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';
import { TravelPlanner } from 'src/travel/travel-planner.service';
import { TravelScheduler } from 'src/travel/travel-scheduler.service';
import { SlotRule } from './quest-capacity';
import {
    CharacterEligibilitySnapshot,
    classifyEligibility,
    isRepeatable,
    pointsCostOf,
    QuestEligibilitySnapshot,
    registrationRuleOf,
    waitingTimeOf,
} from './quest-eligibility';
import {
    ClaimedQuest,
    classifyUnclaimed,
    classifyUnregistered,
    laneClaimFilter,
    laneClaimUpdate,
    LaneClaimSnapshot,
    LaneMovement,
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
    status: {
        title: TitleType;
        location?: unknown;
        awaitingAid?: unknown;
        activeTravel?: unknown;
        injuries?: unknown[];
    };
    assets?: { pet?: unknown } | null;
}

interface LaneClaim {
    characterId: Types.ObjectId;
    quest: ClaimedQuest;
    claim: LaneClaimSnapshot;
    pendingQuestId: Types.ObjectId;
    movement: LaneMovement | null;
}

const QUEST_PROJECTION = {
    'infos.type': 1,
    'infos.markerLocation': 1,
    'infos.timeToComplete': 1,
    requirements: 1,
    registeredAdventurers: 1,
};

// della polilinea del viaggio basta la presenza: endTime evita di leggere le coordinate
const CHARACTER_PROJECTION = {
    'status.title': 1,
    'status.location': 1,
    'status.activeTravel.endTime': 1,
    'status.awaitingAid': 1,
    'status.injuries': 1,
    quests: 1,
    'assets.pet': 1,
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
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
        private readonly wallet: WalletService,
        private readonly clock: Clock,
        private readonly planner: TravelPlanner,
        private readonly scheduler: TravelScheduler,
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
        const rule = this.seatRuleOrReject(quest);
        const character = await this.readCharacter(characterId);
        const rejection = classifyEligibility(quest, character, lane, rule);
        if (rejection) throw rejection;
        // solo la story si accetta da qualunque città: standard e worldMission sono legate alla città del marker (D-26 emendata 2026-10-22)
        const location =
            lane !== QuestLane.story
                ? await this.locationInQuestCity(quest, character)
                : undefined;
        // viaggio automatico solo per la corsia standard (D-02); percorso e velocità prima della transazione (D-21): nel callback solo scritture
        const movement =
            lane === QuestLane.standard && location
                ? await this.movementTo(quest, characterId, location, character)
                : null;
        const claim: LaneClaimSnapshot = {
            title: character.status.title,
            ...(location ? { location } : {}),
        };
        const claimed: ClaimedQuest = {
            id: questId,
            type: quest.infos.type,
            minTitle: quest.requirements?.minTitle,
        };
        const pendingQuestId = new Types.ObjectId();
        await this.connection.transaction(async (session) => {
            await this.claimLane(
                {
                    characterId,
                    quest: claimed,
                    claim,
                    pendingQuestId,
                    movement,
                },
                session,
            );
            if (rule)
                await this.register(
                    quest,
                    characterId,
                    claim.title,
                    rule,
                    session,
                );
            await this.pendingQuestModel.create(
                [
                    {
                        _id: pendingQuestId,
                        // in viaggio il countdown parte all'arrivo (D-15)
                        startDate:
                            movement?.kind === 'travel'
                                ? null
                                : this.clock.now(),
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
        // job dopo il commit (D-21): best-effort, lo sweep copre un accodamento fallito
        if (movement?.kind === 'travel')
            await this.scheduler.schedule(characterId, movement.travel);
        return pendingQuestId;
    }

    // solo la corsia standard si muove (D-02): marker = posizione ⇒ countdown subito; nessuna strada ⇒ salto (D-03, WARN nel planner);
    // marker senza documento POI ⇒ QUEST_NOT_ACCEPTABLE dal planner, prima della transazione (D-27)
    private async movementTo(
        quest: QuestAcceptanceSnapshot,
        characterId: Types.ObjectId,
        location: Types.ObjectId,
        character: CharacterAcceptanceSnapshot,
    ): Promise<LaneMovement | null> {
        const marker = refIdOf(quest.infos.markerLocation);
        if (!marker || sameId(location, marker)) return null;
        const travel = await this.planner.planAuto({
            questId: quest._id,
            characterId,
            from: location,
            to: marker,
            pet: character.assets?.pet,
            injuries: character.status.injuries,
        });
        return travel ? { kind: 'travel', travel } : { kind: 'jump', marker };
    }

    private async readQuest(
        questId: Types.ObjectId,
    ): Promise<QuestAcceptanceSnapshot> {
        // le quest concluse non esistono per la board (D-06, C9)
        const quest = await this.questModel
            .findOne({ _id: questId, concludedAt: null }, QUEST_PROJECTION)
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

    // prima della transazione (D-27, C2): una quest registrata senza slot validi è un difetto di catalogo, mai capienza illimitata; nel log solo l'id
    private seatRuleOrReject(quest: QuestAcceptanceSnapshot): SlotRule | null {
        const rule = registrationRuleOf(quest.infos.type, quest.requirements);
        if (rule !== 'invalid') return rule;
        this.logger.warn(
            `Missione ${quest._id.toHexString()} non accettabile: requiredAdventurers non valido`,
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

    // la città che contiene il marker della quest nei pointsOfInterest, col personaggio sul suo marker o su un suo POI (07 D-10); fail-closed
    private async locationInQuestCity(
        quest: QuestAcceptanceSnapshot,
        character: CharacterAcceptanceSnapshot,
    ): Promise<Types.ObjectId> {
        const marker = refIdOf(quest.infos.markerLocation);
        const location = refIdOf(character.status.location);
        if (!marker || !location) throw GameRuleException.questNotInCity();
        const inCity = await this.cityModel
            .exists({
                pointsOfInterest: marker,
                $or: [
                    { markerLocation: { $in: idForms(location) } },
                    { pointsOfInterest: location },
                ],
            })
            .exec();
        if (!inCity) throw GameRuleException.questNotInCity();
        return location;
    }

    private async claimLane(
        { characterId, quest, claim, pendingQuestId, movement }: LaneClaim,
        session: ClientSession,
    ): Promise<void> {
        const lane = laneOf(quest.type);
        const claimed = await this.characterModel
            .findOneAndUpdate(
                laneClaimFilter(
                    characterId,
                    lane,
                    claim,
                    quest.id,
                    isRepeatable(quest.type),
                ),
                laneClaimUpdate(lane, pendingQuestId, movement),
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
        throw classifyUnclaimed(fresh, quest, claim);
    }

    private async register(
        quest: QuestAcceptanceSnapshot,
        characterId: Types.ObjectId,
        title: TitleType,
        rule: SlotRule,
        session: ClientSession,
    ): Promise<void> {
        const registered = await this.questModel
            .findOneAndUpdate(
                registrationFilter(quest._id, characterId, rule, title),
                registrationUpdate(characterId, title),
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (registered) return;
        const fresh = await this.questModel
            .findById(quest._id, { registeredAdventurers: 1, concludedAt: 1 })
            .session(session)
            .lean<UnregisteredSnapshot | null>()
            .exec();
        throw classifyUnregistered(fresh, characterId);
    }
}
