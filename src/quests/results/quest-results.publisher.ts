import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { documentIdOf } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestResultsService } from './quest-results.service';

const QUEST_RESULT_INSERTS_PIPELINE = [{ $match: { operationType: 'insert' } }];

// un evento per risultato al commit (D-20): tre scrittori (job, sweep, GM) e nessun publish manuale nei servizi
@Injectable()
export class QuestResultsPublisher implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(QuestResultsPublisher.name);
    private changeStream?: ReturnType<Model<QuestResultDocument>['watch']>;

    constructor(
        @InjectModel(QuestResult.name)
        private readonly questResultModel: Model<QuestResultDocument>,
        private readonly results: QuestResultsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        this.changeStream = this.questResultModel.watch(
            QUEST_RESULT_INSERTS_PIPELINE,
        );
        this.changeStream.on(
            'change',
            (change: { documentKey?: unknown }) =>
                void this.publishInserted(documentIdOf(change.documentKey)),
        );
        this.changeStream.on('error', (error: unknown) =>
            this.logger.error(
                'Errore nel change stream dei risultati',
                error instanceof Error ? error.name : 'unknown',
            ),
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.changeStream?.close();
    }

    private async publishInserted(resultId: string | undefined): Promise<void> {
        if (!resultId) return;
        try {
            const questResultReceived = await this.results.findOne(resultId);
            this.pubSub.publish('questResultReceived', { questResultReceived });
        } catch (error) {
            this.logger.error(
                `Pubblicazione di questResultReceived fallita per ${resultId}`,
                error instanceof Error ? error.name : 'unknown',
            );
        }
    }
}
