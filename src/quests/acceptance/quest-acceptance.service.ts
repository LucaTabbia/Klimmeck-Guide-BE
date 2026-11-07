import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { WalletService } from 'src/economy/wallet.service';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { LoreGeographyReader } from 'src/lore/lore-geography.reader';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { TravelPreview } from 'src/models/travel-preview.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';
import { QuestResolutionScheduler } from 'src/quests/outcomes/scheduling/quest-resolution.scheduler';
import { initialLaneDatesOf } from 'src/quests/party/party-rules';
import {
    QuestStartService,
    soloStartDateOf,
} from 'src/quests/party/quest-start.service';
import { mealGuardsOf, mealSetOf } from 'src/travel/food/travel-food.updates';
import {
    PlannedMeal,
    TravelPantryReader,
} from 'src/travel/food/travel-pantry.reader';
import {
    AutoTravelRequest,
    TravelPlanner,
} from 'src/travel/travel-planner.service';
import { AmbushPlanner } from 'src/travel/ambush/ambush-planner.service';
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

interface Registrant {
    characterId: Types.ObjectId;
    title: TitleType;
    now: Date;
}

interface LaneClaim {
    characterId: Types.ObjectId;
    quest: ClaimedQuest;
    claim: LaneClaimSnapshot;
    pendingQuestId: Types.ObjectId;
    movement: LaneMovement | null;
    meal: PlannedMeal | null;
}

type ClaimTarget = Pick<LaneClaim, 'characterId' | 'quest' | 'claim'>;

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
        private readonly questScheduler: QuestResolutionScheduler,
        private readonly questStart: QuestStartService,
        private readonly pantry: TravelPantryReader,
        private readonly ambushPlanner: AmbushPlanner,
        private readonly geography: LoreGeographyReader,
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
        // fame dopo eligibility, città e movimento, prima dei punti (Phase 14 D-11); il callback la rivaluta e fa fede
        await this.fedOrReject(characterId, movement);
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
        const now = this.clock.now();
        // arrivo ≠ avvio per i party (utente 2026-10-25); una quest da soli sul marker parte con il claim (D-22)
        const laneDates = initialLaneDatesOf(lane, movement, now);
        const dates = {
            ...laneDates,
            startDate:
                laneDates.startDate ??
                soloStartDateOf(quest.infos.type, laneDates.arrivedAt),
        };
        const waitingTime = waitingTimeOf(lane, quest.infos.timeToComplete);
        const registration: { before: number | null } = { before: null };
        await this.connection.transaction(async (session) => {
            // il callback viene rieseguito sui WriteConflict: lo stato riparte da zero
            registration.before = null;
            // la dispensa in sessione prima del claim (D-12): salto, nessun movimento, story e worldMission non mangiano (D-13)
            const meal =
                movement?.kind === 'travel'
                    ? await this.pantry.planFor(
                          characterId,
                          movement.travel,
                          session,
                      )
                    : null;
            await this.claimLane(
                {
                    characterId,
                    quest: claimed,
                    claim,
                    pendingQuestId,
                    movement,
                    meal,
                },
                session,
            );
            if (rule)
                registration.before = await this.register(
                    quest,
                    { characterId, title: claim.title, now },
                    rule,
                    session,
                );
            await this.pendingQuestModel.create(
                [
                    {
                        _id: pendingQuestId,
                        ...dates,
                        waitingTime,
                        pointsSpent: cost,
                        quest: questId,
                    },
                ],
                { session },
            );
            if (cost > 0)
                await this.wallet.debitUserPoints(ownerId, cost, session);
        });
        // job e avvio dopo il commit (D-21): best-effort, lo sweep copre un accodamento fallito; story e worldMission non scadono mai (D-03)
        if (movement?.kind === 'travel') {
            await this.scheduler.schedule(characterId, movement.travel);
            if (movement.travel.ambush)
                await this.scheduler.scheduleAmbush(
                    characterId,
                    movement.travel.startTime,
                    movement.travel.ambush.at,
                );
        } else if (lane === QuestLane.standard)
            await this.startOnMarker(
                { questId, pendingQuestId },
                dates.startDate,
                waitingTime,
            );
        // la prima registrazione che non riempie il party apre le 24 ore (utente 2026-10-25); story e worldMission no (D-03)
        const opensPartyWindow =
            lane === QuestLane.standard &&
            rule !== null &&
            registration.before === 0 &&
            rule.total > 1;
        if (opensPartyWindow)
            await this.questScheduler.schedulePartyTimeout({
                questId,
                since: now,
            });
        return pendingQuestId;
    }

    // anteprima owner-only del viaggio automatico (Phase 14 D-08): movimento calcolato come l'accettazione, nessuna scrittura;
    // null = nessun viaggio (story, worldMission, marker = posizione, salto senza strada); non valuta corsia, titolo, posti né punti
    async previewTravel(
        characterId: Types.ObjectId,
        questId: Types.ObjectId,
    ): Promise<TravelPreview | null> {
        const quest = await this.readQuest(questId);
        const character = await this.readCharacter(characterId);
        const lane = laneOf(quest.infos.type);
        if (lane === QuestLane.story) return null;
        const location = await this.locationInQuestCity(quest, character);
        if (lane !== QuestLane.standard) return null;
        const request = this.autoRequestOf(
            quest,
            characterId,
            location,
            character,
        );
        const travel = request ? await this.planner.autoRoute(request) : null;
        return travel ? this.pantry.previewOf(characterId, travel) : null;
    }

    // da soli: la corsia è già avviata dal claim, resta la scadenza; party: decide QuestStartService (utente 2026-10-25)
    private async startOnMarker(
        trigger: { questId: Types.ObjectId; pendingQuestId: Types.ObjectId },
        startDate: Date | null,
        waitingTime: number,
    ): Promise<void> {
        if (!startDate) {
            await this.questStart.tryStart(trigger);
            return;
        }
        await this.questStart.scheduleStarted({
            pendingQuestId: trigger.pendingQuestId,
            startDate,
            waitingTime,
        });
    }

    // solo la corsia standard si muove (D-02): marker = posizione ⇒ arrivo immediato (da soli parte con il claim, D-22); nessuna strada ⇒ salto (D-03, WARN nel planner);
    // marker senza documento POI ⇒ QUEST_NOT_ACCEPTABLE dal planner, prima della transazione (D-27)
    private async movementTo(
        quest: QuestAcceptanceSnapshot,
        characterId: Types.ObjectId,
        location: Types.ObjectId,
        character: CharacterAcceptanceSnapshot,
    ): Promise<LaneMovement | null> {
        const request = this.autoRequestOf(
            quest,
            characterId,
            location,
            character,
        );
        if (!request) return null;
        const travel = await this.planner.planAuto(request);
        // solo il viaggio reale sorteggia, l'anteprima mai (Phase 15 D-05, D-15)
        return travel
            ? { kind: 'travel', travel: this.ambushPlanner.withAmbush(travel) }
            : {
                  kind: 'jump',
                  marker: request.to,
                  // catalogo letto fuori dalla transazione, come il piano del viaggio (Phase 16 D-05)
                  geography: await this.geography.ofMarker(request.to),
              };
    }

    // pre-verifica fuori sessione: solo il viaggio mangia (D-13)
    private async fedOrReject(
        characterId: Types.ObjectId,
        movement: LaneMovement | null,
    ): Promise<void> {
        if (movement?.kind !== 'travel') return;
        const { plan } = await this.pantry.planFor(
            characterId,
            movement.travel,
        );
        if (!plan.arrivesAlive) throw GameRuleException.travelStarving();
    }

    // marker assente o uguale alla posizione ⇒ nessun movimento (D-02, D-22)
    private autoRequestOf(
        quest: QuestAcceptanceSnapshot,
        characterId: Types.ObjectId,
        location: Types.ObjectId,
        character: CharacterAcceptanceSnapshot,
    ): AutoTravelRequest | null {
        const marker = refIdOf(quest.infos.markerLocation);
        if (!marker || sameId(location, marker)) return null;
        return {
            questId: quest._id,
            characterId,
            from: location,
            to: marker,
            pet: character.assets?.pet,
            injuries: character.status.injuries,
        };
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

    // consumo e HP nello stesso update condizionale del claim, quantità e HP riaffermati nel filtro (D-12)
    private async claimLane(
        {
            characterId,
            quest,
            claim,
            pendingQuestId,
            movement,
            meal,
        }: LaneClaim,
        session: ClientSession,
    ): Promise<void> {
        const target = { characterId, quest, claim };
        if (meal && !meal.plan.arrivesAlive)
            throw await this.starvingOrRace(target, session);
        const lane = laneOf(quest.type);
        const claimed = await this.characterModel
            .findOneAndUpdate(
                laneClaimFilter(
                    characterId,
                    lane,
                    claim,
                    quest.id,
                    isRepeatable(quest.type),
                    meal ? mealGuardsOf(meal.plan, meal.pantry.hpRaw) : {},
                ),
                laneClaimUpdate(
                    lane,
                    pendingQuestId,
                    movement,
                    meal ? mealSetOf(meal.plan, meal.pantry.assets) : {},
                ),
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (claimed) return;
        throw await this.unclaimedError(target, session);
    }

    // in corsa il codice della corsa viene prima della fame (D-11): la fame vale solo se il claim è ancora possibile
    private async starvingOrRace(
        target: ClaimTarget,
        session: ClientSession,
    ): Promise<Error> {
        const { characterId, quest, claim } = target;
        const claimable = await this.characterModel
            .exists(
                laneClaimFilter(
                    characterId,
                    laneOf(quest.type),
                    claim,
                    quest.id,
                    isRepeatable(quest.type),
                ),
            )
            .session(session)
            .exec();
        return claimable
            ? GameRuleException.travelStarving()
            : this.unclaimedError(target, session);
    }

    // la rilettura in sessione sceglie solo il codice (Phase 4)
    private async unclaimedError(
        { characterId, quest, claim }: ClaimTarget,
        session: ClientSession,
    ): Promise<Error> {
        const fresh = await this.characterModel
            .findOne(activeCharacterById(characterId), CHARACTER_PROJECTION)
            .session(session)
            .lean<UnclaimedSnapshot | null>()
            .exec();
        return classifyUnclaimed(fresh, quest, claim);
    }

    // ritorna i registrati prima della scrittura: la prima registrazione apre la finestra delle 24 ore
    private async register(
        quest: QuestAcceptanceSnapshot,
        { characterId, title, now }: Registrant,
        rule: SlotRule,
        session: ClientSession,
    ): Promise<number> {
        const before = await this.questModel
            .findOneAndUpdate(
                registrationFilter(quest._id, characterId, rule, title),
                registrationUpdate(characterId, title, now),
                {
                    session,
                    returnDocument: 'before',
                    projection: { registeredAdventurers: 1 },
                },
            )
            .lean<{ registeredAdventurers?: unknown[] | null } | null>()
            .exec();
        if (before) return (before.registeredAdventurers ?? []).length;
        const fresh = await this.questModel
            .findById(quest._id, {
                registeredAdventurers: 1,
                concludedAt: 1,
                startedAt: 1,
            })
            .session(session)
            .lean<UnregisteredSnapshot | null>()
            .exec();
        throw classifyUnregistered(fresh, characterId);
    }
}
