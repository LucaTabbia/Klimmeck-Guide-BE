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
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { documentIdOf } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestsService } from './quests.service';

const QUEST_UPDATES_PIPELINE = [
    { $match: { operationType: { $in: ['update', 'replace'] } } },
];

// contatore del party in tempo reale (utente 2026-10-26: "il counter degli avventurieri mancanti deve aggiornarsi nel momento in cui qualcuno accetta la missione"):
// un evento per update al commit, con la quest popolata come sulla board; nessun publish manuale nei servizi
@Injectable()
export class QuestsPublisher implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(QuestsPublisher.name);
    private changeStream?: ReturnType<Model<QuestDocument>['watch']>;
    private readonly inFlight = new Map<string, Promise<void>>();
    private readonly dirty = new Set<string>();

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        private readonly quests: QuestsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        this.changeStream = this.questModel.watch(QUEST_UPDATES_PIPELINE);
        this.changeStream.on('change', (change: { documentKey?: unknown }) =>
            this.requestPublish(documentIdOf(change.documentKey)),
        );
        this.changeStream.on('error', (error: unknown) =>
            this.logger.error(
                'Errore nel change stream delle quest',
                error instanceof Error ? error.name : 'unknown',
            ),
        );
    }

    async onModuleDestroy(): Promise<void> {
        await this.changeStream?.close();
    }

    // single-flight per quest con rerun (come PendingRequestsPublisher): una raffica sulla stessa quest costa al più
    // una lettura in corso e una in coda, e l'ultimo evento pubblicato è sempre lo stato più recente
    private requestPublish(questId: string | undefined): void {
        if (!questId) return;
        this.dirty.add(questId);
        if (!this.inFlight.has(questId)) {
            this.inFlight.set(questId, this.drain(questId));
        }
    }

    private async drain(questId: string): Promise<void> {
        try {
            while (this.dirty.delete(questId)) {
                await this.publishUpdated(questId);
            }
        } finally {
            this.inFlight.delete(questId);
        }
    }

    private async publishUpdated(questId: string): Promise<void> {
        try {
            const questUpdated = await this.quests.findOne(questId);
            this.pubSub.publish('questUpdated', { questUpdated });
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                this.logger.debug(
                    `Quest ${questId} conclusa o sparita: nessun questUpdated`,
                );
                return;
            }
            this.logger.error(
                `Pubblicazione di questUpdated fallita per ${questId}`,
                error instanceof Error ? error.name : 'unknown',
            );
        }
    }
}
