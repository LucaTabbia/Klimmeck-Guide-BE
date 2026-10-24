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
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { PendingRequestsService } from './pending-requests.service';

// la PendingQuest non ha corsia né personaggio: ogni insert/delete ricalcola l'intera coda (D-22); il delete arriva senza fullDocument (RESEARCH Q2)
const PENDING_QUEST_CHANGES = [
    { $match: { operationType: { $in: ['insert', 'delete'] } } },
];

function codeOf(error: unknown): string {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' || typeof code === 'number') {
        return String(code);
    }
    return error instanceof Error ? error.name : 'unknown';
}

@Injectable()
export class PendingRequestsPublisher implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PendingRequestsPublisher.name);
    private changeStream?: ReturnType<Model<PendingQuestDocument>['watch']>;
    private draining: Promise<void> | null = null;
    private dirty = false;

    constructor(
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly requests: PendingRequestsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        this.changeStream = this.pendingQuestModel.watch(PENDING_QUEST_CHANGES);
        this.changeStream.on('change', () => this.requestRefresh());
        this.changeStream.on('error', (error: unknown) =>
            this.logger.error(
                `Errore nel change stream delle missioni in attesa: ${codeOf(error)}`,
            ),
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.changeStream?.close();
    }

    // single-flight con rerun: una worldMission a nove registrati elimina nove PendingQuest nello stesso commit, una sola lista per raffica
    requestRefresh(): void {
        this.dirty = true;
        this.draining ??= this.drain();
    }

    private async drain(): Promise<void> {
        try {
            while (this.dirty) {
                this.dirty = false;
                await this.publishOnce();
            }
        } finally {
            this.draining = null;
        }
    }

    private async publishOnce(): Promise<void> {
        try {
            const pendingRequestsUpdated = await this.requests.list();
            this.pubSub.publish('pendingRequestsUpdated', {
                pendingRequestsUpdated,
            });
        } catch (error) {
            this.logger.error(
                `Ricalcolo della coda del locandiere fallito: ${codeOf(error)}`,
            );
        }
    }
}
