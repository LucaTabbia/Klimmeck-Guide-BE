import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { TravelPreview } from 'src/models/travel-preview.model';
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
    'status.activeTravel.endTime': 1,
    'status.location': 1,
    'quests.pendingQuest': 1,
};

interface TeleportedSnapshot {
    status?: { activeTravel?: { startTime?: Date } | null } | null;
}

@Injectable()
export class TravelService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        private readonly planner: TravelPlanner,
        private readonly scheduler: TravelScheduler,
        private readonly pantry: TravelPantryReader,
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
        const plan = await this.planner.planFree(characterId, poiId);
        // rieseguito dal driver sui WriteConflict: la dispensa si rilegge, la partenza ricalcola sul cibo del momento (D-10)
        await this.connection.transaction((session) =>
            this.departWithMeal(characterId, plan, session),
        );
        await this.scheduler.schedule(characterId, plan.travel);
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
        if (!meal.arrivesAlive)
            throw await this.starvingOrRace(
                characterId,
                plan.location,
                session,
            );
        const started = await this.characterModel
            .findOneAndUpdate(
                startTravelFilter(
                    characterId,
                    plan.location,
                    mealGuardsOf(meal, pantry.hpRaw),
                ),
                startTravelUpdate(plan.travel, mealSetOf(meal, pantry.assets)),
                { session, projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (!started) throw await this.unstartedError(characterId, session);
    }

    // in corsa il codice della corsa viene prima della fame (D-11): la fame vale solo se la partenza è ancora possibile
    private async starvingOrRace(
        characterId: Types.ObjectId,
        location: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const startable = await this.characterModel
            .exists(startTravelFilter(characterId, location))
            .session(session)
            .exec();
        return startable
            ? GameRuleException.travelStarving()
            : this.unstartedError(characterId, session);
    }

    // la rilettura sceglie solo il codice (Phase 8 D-21)
    private async unstartedError(
        characterId: Types.ObjectId,
        session: ClientSession,
    ): Promise<Error> {
        const fresh = await this.characterModel
            .findOne(activeCharacterById(characterId), UNSTARTED_PROJECTION)
            .session(session)
            .lean<UnstartedSnapshot | null>()
            .exec();
        return classifyUnstarted(fresh);
    }

    // un solo findOneAndUpdate (D-16, "il filtro è la regola"): location sovrascritta e viaggio cancellato insieme; nessuna push, nessuna quest toccata
    async teleport(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<void> {
        if (!(await this.poiModel.exists({ _id: poiId })))
            throw ResourceNotFoundException.pointOfInterest();
        const before = await this.characterModel
            .findOneAndUpdate(
                teleportFilter(characterId),
                teleportUpdate(poiId),
                {
                    returnDocument: 'before',
                    projection: TELEPORT_PROJECTION,
                },
            )
            .lean<TeleportedSnapshot | null>()
            .exec();
        if (!before) {
            const fresh = await this.characterModel
                .findOne(activeCharacterById(characterId), {
                    'quests.pendingQuest': 1,
                })
                .lean<UnteleportedSnapshot | null>()
                .exec();
            throw classifyUnteleported(fresh);
        }
        // best-effort (D-16): il job sopravvissuto non trova più il viaggio al fire (D-12)
        const startTime = before.status?.activeTravel?.startTime;
        if (startTime) await this.scheduler.cancel(characterId, startTime);
    }
}
