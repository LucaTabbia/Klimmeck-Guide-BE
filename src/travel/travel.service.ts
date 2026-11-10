import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    notImprisonedAt,
    refusalWhileImprisoned,
} from 'src/characters/imprisonment/imprisonment';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { LoreGeographyReader } from 'src/lore/lore-geography.reader';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { TravelPreview } from 'src/models/travel-preview.model';
import type { AmbushReportDraft } from './ambush/ambush-plan';
import { AmbushPlanner } from './ambush/ambush-planner.service';
import { ambushResultDraftsOf } from './ambush/ambush-results';
import { TravelPantryReader } from './food/travel-pantry.reader';
import { mealGuardsOf, mealSetOf } from './food/travel-food.updates';
import { FreeTravelPlan, TravelPlanner } from './travel-planner.service';
import { TravelScheduler } from './travel-scheduler.service';
import {
    classifyUnstarted,
    classifyUnteleported,
    startTravelFilter,
    startTravelUpdate,
    TELEPORT_PROJECTION,
    teleportFilter,
    teleportUpdate,
    UnstartedSnapshot,
    UnteleportedSnapshot,
} from './travel.updates';

const UNSTARTED_PROJECTION = {
    'status.awaitingAid': 1,
    'status.imprisonedUntil': 1,
    'status.activeTravel.endTime': 1,
    'status.location': 1,
    'quests.pendingQuest': 1,
};

interface TeleportedSnapshot {
    status?: {
        activeTravel?: {
            startTime?: Date;
            ambush?: { at?: Date } | null;
            ambushReports?: AmbushReportDraft[];
        } | null;
    } | null;
}

@Injectable()
export class TravelService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        private readonly planner: TravelPlanner,
        private readonly scheduler: TravelScheduler,
        private readonly pantry: TravelPantryReader,
        private readonly ambushPlanner: AmbushPlanner,
        private readonly geography: LoreGeographyReader,
    ) {}

    // stesse letture e stessi codici dell'avvio, nessuna scrittura (Phase 8 D-11); cibo e vita coi numeri, mai il codice di fame (Phase 14 D-09)
    async preview(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<TravelPreview> {
        const { travel } = await this.planner.planFree(characterId, poiId);
        return this.pantry.previewOf(characterId, travel);
    }

    // regole di Phase 8 fuori dalla transazione; dispensa letta in sessione e consumo nello stesso update della partenza (Phase 14 D-12): un rifiuto non scrive nulla; il job dopo il commit è best-effort
    async startTravel(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<void> {
        const planned = await this.planner.planFree(characterId, poiId);
        // fuori dal callback: un retry per WriteConflict riscrive la stessa imboscata (Phase 15 D-05, Pitfall 10)
        const plan = {
            ...planned,
            travel: this.ambushPlanner.withAmbush(planned.travel),
        };
        // rieseguito dal driver sui WriteConflict: la dispensa si rilegge, la partenza ricalcola sul cibo del momento (D-10)
        await this.connection.transaction((session) =>
            this.departWithMeal(characterId, plan, session),
        );
        await this.scheduler.schedule(characterId, plan.travel);
        if (plan.travel.ambush)
            await this.scheduler.scheduleAmbush(
                characterId,
                plan.travel.startTime,
                plan.travel.ambush.at,
            );
    }

    private async departWithMeal(
        characterId: Types.ObjectId,
        plan: FreeTravelPlan,
        session: ClientSession,
    ): Promise<void> {
        const { plan: meal, pantry } = await this.pantry.planFor(
            characterId,
            plan.travel,
            session,
        );
        // la partenza pianificata è l'istante della prigione riaffermata nel filtro (quick 261110-cgd)
        const now = plan.travel.startTime;
        if (!meal.arrivesAlive)
            throw await this.starvingOrRace(
                characterId,
                plan.location,
                now,
                session,
            );
        const started = await this.characterModel
            .findOneAndUpdate(
                startTravelFilter(characterId, plan.location, {
                    ...notImprisonedAt(now),
                    ...mealGuardsOf(meal, pantry.hpRaw),
                }),
                startTravelUpdate(plan.travel, mealSetOf(meal, pantry.assets)),
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (!started)
            throw await this.unstartedError(characterId, now, session);
    }

    // in corsa il codice della corsa viene prima della fame (D-11): la fame vale solo se la partenza è ancora possibile
    private async starvingOrRace(
        characterId: Types.ObjectId,
        location: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<Error> {
        const startable = await this.characterModel
            .exists(
                startTravelFilter(characterId, location, notImprisonedAt(now)),
            )
            .session(session)
            .exec();
        return startable
            ? GameRuleException.travelStarving()
            : this.unstartedError(characterId, now, session);
    }

    // la rilettura sceglie solo il codice (Phase 8 D-21)
    private async unstartedError(
        characterId: Types.ObjectId,
        now: Date,
        session: ClientSession,
    ): Promise<Error> {
        const fresh = await this.characterModel
            .findOne(activeCharacterById(characterId), UNSTARTED_PROJECTION)
            .session(session)
            .lean<
                | (UnstartedSnapshot & {
                      status?: { imprisonedUntil?: unknown } | null;
                  })
                | null
            >()
            .exec();
        return (
            refusalWhileImprisoned(fresh?.status, now) ??
            classifyUnstarted(fresh)
        );
    }

    // un solo findOneAndUpdate in transazione (D-16, "il filtro è la regola"): location sovrascritta e viaggio cancellato insieme, report trattenuti consegnati nello stesso commit (Phase 15 D-13); nessuna push, nessuna quest toccata
    async teleport(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<void> {
        if (!(await this.poiModel.exists({ _id: poiId })))
            throw ResourceNotFoundException.pointOfInterest();
        // catalogo letto fuori dal callback: nella transazione solo scritture (Phase 16 D-05)
        const geography = await this.geography.ofMarker(poiId);
        const outcome: { before: TeleportedSnapshot | null } = { before: null };
        await this.connection.transaction(async (session) => {
            // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
            outcome.before = null;
            outcome.before = await this.teleportInSession(
                characterId,
                poiId,
                geography,
                session,
            );
        });
        await this.cancelTravelJobs(characterId, outcome.before);
    }

    private async teleportInSession(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
        geography: readonly Types.ObjectId[],
        session: ClientSession,
    ): Promise<TeleportedSnapshot> {
        const before = await this.characterModel
            .findOneAndUpdate(
                teleportFilter(characterId),
                teleportUpdate(poiId, geography),
                {
                    session,
                    returnDocument: 'before',
                    projection: TELEPORT_PROJECTION,
                },
            )
            .lean<TeleportedSnapshot | null>()
            .exec();
        if (!before) throw await this.unteleportedError(characterId, session);
        const reports = before.status?.activeTravel?.ambushReports ?? [];
        if (reports.length > 0) {
            await this.questResultModel.create(
                ambushResultDraftsOf(reports, characterId),
                { session, ordered: true },
            );
        }
        return before;
    }

    private async unteleportedError(
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const fresh = await this.characterModel
            .findOne(activeCharacterById(characterId), {
                'quests.pendingQuest': 1,
            })
            .session(session)
            .lean<UnteleportedSnapshot | null>()
            .exec();
        return classifyUnteleported(fresh);
    }

    // best-effort dopo il commit (D-16): il job sopravvissuto non trova più il viaggio al fire (D-12)
    private async cancelTravelJobs(
        characterId: Types.ObjectId,
        before: TeleportedSnapshot | null,
    ): Promise<void> {
        const travel = before?.status?.activeTravel;
        if (!travel?.startTime) return;
        await this.scheduler.cancel(characterId, travel.startTime);
        // l'imboscata pendente decade per identità anche se la rimozione fallisce (D-13)
        const ambushAt = travel.ambush?.at;
        if (ambushAt) {
            await this.scheduler.cancelAmbush(
                characterId,
                travel.startTime,
                ambushAt,
            );
        }
    }
}
