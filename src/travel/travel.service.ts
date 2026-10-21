import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { TravelPreview } from 'src/models/travel-preview.model';
import { TravelPlanner } from './travel-planner.service';
import { TravelScheduler } from './travel-scheduler.service';

@Injectable()
export class TravelService {
    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly planner: TravelPlanner,
        private readonly scheduler: TravelScheduler,
    ) {}

    preview(
        _characterId: Types.ObjectId,
        _poiId: Types.ObjectId,
    ): Promise<TravelPreview> {
        throw new Error('not implemented');
    }

    startTravel(
        _characterId: Types.ObjectId,
        _poiId: Types.ObjectId,
    ): Promise<void> {
        throw new Error('not implemented');
    }
}
