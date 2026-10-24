import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';

export type ResolutionOutcome = 'resolved' | 'stale' | 'waiting';

export interface StandardTrigger {
    pendingQuestId: Types.ObjectId;
    startDate: Date;
}

@Injectable()
export class QuestResolutionService {
    resolveIndividual(_trigger: StandardTrigger): Promise<ResolutionOutcome> {
        throw new Error('not implemented');
    }
}
