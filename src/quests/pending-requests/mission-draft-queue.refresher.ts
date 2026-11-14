import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { ChangeStreamPublisher } from 'src/mongo/change-stream-publisher';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { PendingRequestsPublisher } from './pending-requests.publisher';

// avvio e scarto della bozza scrivono solo il marcatore (D-23): la pipeline della coda resta quella pinnata
const MISSION_DRAFT_QUEUE_CHANGES = {
    pipeline: [
        {
            $match: {
                operationType: 'update',
                'updateDescription.updatedFields.missionDraftStartedAt': {
                    $exists: true,
                },
            },
        },
    ],
    subject: 'dei flussi guidati in coda',
};

@Injectable()
export class MissionDraftQueueRefresher extends ChangeStreamPublisher<PendingQuestDocument> {
    constructor(
        @InjectModel(PendingQuest.name)
        pendingQuestModel: Model<PendingQuestDocument>,
        private readonly queue: PendingRequestsPublisher,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(pendingQuestModel, MISSION_DRAFT_QUEUE_CHANGES, pubSub);
    }

    // i marcatori di un gruppo cambiano nello stesso commit: un solo ricalcolo per raffica
    protected onChange(): void {
        this.queue.requestRefresh();
    }

    // un avvio o uno scarto persi nel buco della storia: ricalcolo completo (D-17)
    protected onHistoryLost(): void {
        this.queue.requestRefresh();
    }
}
