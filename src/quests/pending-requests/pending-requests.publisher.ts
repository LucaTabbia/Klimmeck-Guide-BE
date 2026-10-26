import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { ChangeStreamPublisher } from 'src/mongo/change-stream-publisher';
import { KeyedSingleFlight } from 'src/mongo/keyed-single-flight';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { PendingRequestsService } from './pending-requests.service';

// la PendingQuest non ha corsia né personaggio: ogni insert/delete ricalcola l'intera coda (D-22); il delete arriva senza fullDocument (RESEARCH Q2)
const PENDING_QUEST_CHANGES = {
    pipeline: [{ $match: { operationType: { $in: ['insert', 'delete'] } } }],
    subject: 'delle missioni in attesa',
};
const WHOLE_QUEUE = 'pendingRequests';

@Injectable()
export class PendingRequestsPublisher extends ChangeStreamPublisher<PendingQuestDocument> {
    // una worldMission a nove registrati elimina nove PendingQuest nello stesso commit: una sola lista per raffica
    private readonly refreshes = new KeyedSingleFlight(() =>
        this.publishOnce(),
    );

    constructor(
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        private readonly requests: PendingRequestsService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(pendingQuestModel, PENDING_QUEST_CHANGES, pubSub);
    }

    requestRefresh(): void {
        this.refreshes.request(WHOLE_QUEUE);
    }

    protected onChange(): void {
        this.requestRefresh();
    }

    private async publishOnce(): Promise<void> {
        try {
            const pendingRequestsUpdated = await this.requests.list();
            this.publish('pendingRequestsUpdated', { pendingRequestsUpdated });
        } catch (error) {
            this.logger.error(
                `Ricalcolo della coda del locandiere fallito: ${describeError(error)}`,
            );
        }
    }
}
