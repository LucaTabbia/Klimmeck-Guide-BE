import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf } from 'src/mongo/document-id';
import { KeyedSingleFlight } from 'src/mongo/keyed-single-flight';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { SubscriberRegistry } from 'src/subscriber-registry';
import { QuestsService } from './quests.service';

const QUEST_UPDATES = {
    pipeline: [{ $match: { operationType: { $in: ['update', 'replace'] } } }],
    subject: 'delle quest',
};

// contatore del party in tempo reale (utente 2026-10-26: "il counter degli avventurieri mancanti deve aggiornarsi nel momento in cui qualcuno accetta la missione"):
// un evento per update al commit, con la quest popolata come sulla board; nessun publish manuale nei servizi
@Injectable()
export class QuestsPublisher extends ChangeStreamPublisher<QuestDocument> {
    // una lettura alla volta per quest (raffiche ravvicinate: l'ultimo evento è lo stato più recente)
    private readonly reads = new KeyedSingleFlight((questId) =>
        this.publishUpdated(questId),
    );

    constructor(
        @InjectModel(Quest.name) questModel: Model<QuestDocument>,
        private readonly quests: QuestsService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
        private readonly subscribers: SubscriberRegistry,
    ) {
        super(questModel, QUEST_UPDATES, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const questId = documentIdOf(change.documentKey);
        if (questId) this.reads.request(questId);
    }

    // lo stream resta sempre aperto (aprirlo al primo subscriber perderebbe gli update fra snapshot e cursore, Pitfall 9):
    // si salta solo la rilettura popolata quando nessuno ascolta quella quest
    private async publishUpdated(questId: string): Promise<void> {
        if (!this.subscribers.hasSubscribers(`questUpdated:${questId}`)) return;
        try {
            const questUpdated = await this.quests.findOne(questId);
            this.publish('questUpdated', questId, { questUpdated });
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                this.logger.debug(
                    `Quest ${questId} conclusa o sparita: nessun questUpdated`,
                );
                return;
            }
            this.logger.error(
                `Pubblicazione di questUpdated fallita per ${questId}: ${describeError(error)}`,
            );
        }
    }
}
