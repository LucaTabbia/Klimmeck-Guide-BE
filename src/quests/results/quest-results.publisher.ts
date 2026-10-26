import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf } from 'src/mongo/document-id';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestResultsService } from './quest-results.service';

const QUEST_RESULT_INSERTS = {
    pipeline: [{ $match: { operationType: 'insert' } }],
    subject: 'dei risultati',
};

// un evento per risultato al commit (D-20): tre scrittori (job, sweep, GM) e nessun publish manuale nei servizi
@Injectable()
export class QuestResultsPublisher extends ChangeStreamPublisher<QuestResultDocument> {
    constructor(
        @InjectModel(QuestResult.name)
        questResultModel: Model<QuestResultDocument>,
        private readonly results: QuestResultsService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(questResultModel, QUEST_RESULT_INSERTS, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        void this.publishInserted(documentIdOf(change.documentKey));
    }

    private async publishInserted(resultId: string | undefined): Promise<void> {
        if (!resultId) return;
        try {
            const questResultReceived = await this.results.findOne(resultId);
            this.publish('questResultReceived', { questResultReceived });
        } catch (error) {
            this.logger.error(
                `Pubblicazione di questResultReceived fallita per ${resultId}: ${describeError(error)}`,
            );
        }
    }
}
