import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class TravelScheduler {
    schedule(
        _characterId: Types.ObjectId,
        _travel: { startTime: Date; endTime: Date },
    ): Promise<void> {
        throw new Error('not implemented');
    }

    cancel(_characterId: Types.ObjectId, _startTime: Date): Promise<void> {
        throw new Error('not implemented');
    }
}
