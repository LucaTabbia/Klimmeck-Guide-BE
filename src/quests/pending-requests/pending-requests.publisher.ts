import { Injectable } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import type { PendingQuestDocument } from 'src/models/pending-quest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import type { PendingRequestsService } from './pending-requests.service';

@Injectable()
export class PendingRequestsPublisher {
    constructor(
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        private readonly requests: PendingRequestsService,
        private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    onModuleInit(): void {}

    requestRefresh(): void {}
}
