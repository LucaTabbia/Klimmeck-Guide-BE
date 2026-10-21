import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ActiveTravelDraft } from './travel-timing';

export interface FreeTravelPlan {
    location: Types.ObjectId;
    travel: ActiveTravelDraft;
}

export interface AutoTravelRequest {
    questId: Types.ObjectId;
    characterId: Types.ObjectId;
    from: Types.ObjectId;
    to: Types.ObjectId;
    pet: unknown;
}

@Injectable()
export class TravelPlanner {
    planFree(
        _characterId: Types.ObjectId,
        _poiId: Types.ObjectId,
    ): Promise<FreeTravelPlan> {
        throw new Error('not implemented');
    }

    planAuto(_request: AutoTravelRequest): Promise<ActiveTravelDraft | null> {
        throw new Error('not implemented');
    }
}
