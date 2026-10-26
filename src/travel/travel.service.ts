import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
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
import { TravelPlanner } from './travel-planner.service';
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
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        private readonly planner: TravelPlanner,
        private readonly scheduler: TravelScheduler,
    ) {}

    // stesse letture e stessi codici dell'avvio, nessuna scrittura (D-11)
    async preview(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<TravelPreview> {
        const { travel } = await this.planner.planFree(characterId, poiId);
        return {
            distance: travel.road.distance,
            duration: travel.duration,
            road: travel.road,
        };
    }

    // un solo update condizionale (D-21); la rilettura sceglie solo il codice; il job dopo la scrittura è best-effort
    async startTravel(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<void> {
        const plan = await this.planner.planFree(characterId, poiId);
        const started = await this.characterModel
            .findOneAndUpdate(
                startTravelFilter(characterId, plan.location),
                startTravelUpdate(plan.travel),
                { projection: { _id: 1 } },
            )
            .lean()
            .exec();
        if (!started) {
            const fresh = await this.characterModel
                .findOne(activeCharacterById(characterId), UNSTARTED_PROJECTION)
                .lean<UnstartedSnapshot | null>()
                .exec();
            throw classifyUnstarted(fresh);
        }
        await this.scheduler.schedule(characterId, plan.travel);
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
