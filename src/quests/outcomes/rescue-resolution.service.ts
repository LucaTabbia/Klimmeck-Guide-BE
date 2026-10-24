import { Injectable } from '@nestjs/common';
import type {
    ResolutionOutcome,
    StandardLoad,
} from './resolution-loader.service';

@Injectable()
export class RescueResolutionService {
    resolveRescue(
        _loaded: StandardLoad,
        _now: Date,
    ): Promise<ResolutionOutcome> {
        return Promise.reject(new Error('not implemented'));
    }
}
