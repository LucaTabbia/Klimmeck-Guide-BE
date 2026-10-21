import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { TravelPreview } from 'src/models/travel-preview.model';
import { TravelPlanner } from './travel-planner.service';
import { TravelScheduler } from './travel-scheduler.service';
import {
    classifyUnstarted,
    startTravelFilter,
    startTravelUpdate,
    UnstartedSnapshot,
} from './travel.updates';

const UNSTARTED_PROJECTION = {
    'status.activeTravel.endTime': 1,
    'status.location': 1,
    'quests.pendingQuest': 1,
};

@Injectable()
export class TravelService {
    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
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

    async teleport(
        characterId: Types.ObjectId,
        poiId: Types.ObjectId,
    ): Promise<void> {
        void characterId;
        void poiId;
        await Promise.resolve();
        throw new Error('not implemented');
    }
}
