import { Inject } from '@nestjs/common';
import { Args, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { PubSub } from '@graphql-yoga/subscription';
import { subscribeWithSnapshot } from 'src/graphql/subscribe-with-snapshot';
import { Quest } from 'src/models/quest/quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';
import { QuestsService } from './quests.service';

@Resolver(() => Quest)
export class QuestsResolver {
    constructor(
        private readonly questsService: QuestsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    @Query(() => [Quest])
    async quests(): Promise<Quest[]> {
        return this.questsService.findAll();
    }

    @Query(() => Quest)
    async quest(@Args('id', ObjectIdPipe) id: string): Promise<Quest> {
        return this.questsService.findOne(id);
    }

    // board pubblica per ogni utente autenticato: snapshot alla subscribe come pendingRequestsUpdated, poi un evento a ogni update;
    // id malformato ⇒ BAD_USER_INPUT dalla pipe; quest conclusa ⇒ NOT_FOUND come quest(id)
    @Subscription(() => Quest, { name: 'questUpdated' })
    questUpdated(
        @Args('questId', ObjectIdPipe) questId: string,
    ): Promise<AsyncIterableIterator<{ questUpdated: Quest }>> {
        return subscribeWithSnapshot(
            this.pubSub.subscribe('questUpdated', questId),
            async () => ({
                questUpdated: await this.questsService.findOne(questId),
            }),
        );
    }
}
