import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import {
    dropOrphanResultRefs,
    QUEST_RESULT_POPULATE,
} from './quest-result.populate';

@Injectable()
export class QuestResultsService {
    constructor(
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
    ) {}

    async findOne(id: string): Promise<QuestResult> {
        const resultId = objectIdFromHex(id);
        if (!resultId) throw ResourceNotFoundException.questResult();
        const result = await this.questResultModel
            .findById(resultId)
            .populate(QUEST_RESULT_POPULATE)
            .exec();
        if (!result) throw ResourceNotFoundException.questResult();
        dropOrphanResultRefs(result);
        return result;
    }
}
