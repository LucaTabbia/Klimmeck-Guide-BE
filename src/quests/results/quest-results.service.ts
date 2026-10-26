import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import type { QuestResultDraft } from 'src/quests/outcomes/outcome-plan';
import {
    dropOrphanResultRefs,
    QUEST_RESULT_POPULATE,
    unpopulatedResultOf,
} from './quest-result.populate';

@Injectable()
export class QuestResultsService {
    private readonly logger = new Logger(QuestResultsService.name);

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

    // la scrittura è già committata: una rilettura fallita non diventa mai un errore sul filo (WR-03)
    async readCommitted(
        drafts: readonly QuestResultDraft[],
    ): Promise<QuestResult[]> {
        const ids = drafts.map(({ _id }) => _id);
        try {
            const stored = await this.questResultModel
                .find({ _id: { $in: ids } })
                .populate(QUEST_RESULT_POPULATE)
                .exec();
            const byId = new Map(
                stored.map((result) => [String(result._id), result]),
            );
            return drafts.map((draft) => {
                const result = byId.get(String(draft._id));
                if (!result) return unpopulatedResultOf(draft);
                dropOrphanResultRefs(result);
                return result;
            });
        } catch (error) {
            this.logger.warn(
                `Rilettura dei risultati ${ids.map(String).join(', ')} fallita dopo il commit: ${describeError(error)}`,
            );
            return drafts.map(unpopulatedResultOf);
        }
    }
}
