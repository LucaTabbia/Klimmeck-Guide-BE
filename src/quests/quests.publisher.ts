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

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        private readonly quests: QuestsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {
        this.changeStream = this.questModel.watch(QUEST_UPDATES_PIPELINE);
        this.changeStream.on(
            'change',
            (change: { documentKey?: unknown }) =>
                void this.publishUpdated(documentIdOf(change.documentKey)),
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

    private async publishUpdated(questId: string | undefined): Promise<void> {
        if (!questId) return;
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
