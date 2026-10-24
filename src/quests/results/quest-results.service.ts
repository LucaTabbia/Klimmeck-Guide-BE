import { Injectable } from '@nestjs/common';
import { QuestResult } from 'src/models/quest-result/quest-result.model';

@Injectable()
export class QuestResultsService {
    findOne(_id: string): Promise<QuestResult> {
        return Promise.reject(new Error('not implemented'));
    }
}
