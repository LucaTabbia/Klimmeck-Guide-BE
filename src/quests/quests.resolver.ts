import { Inject } from '@nestjs/common';
import { Args, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { PubSub } from '@graphql-yoga/subscription';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
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

    // tabellone per area del personaggio corrente (13.1 D-05): l'identità viene solo dal token
    @Query(() => [Quest])
    async quests(@CurrentUser() identity: AuthIdentity): Promise<Quest[]> {
        return this.questsService.findForViewer(identity.userId);
    }

    @Query(() => Quest)
    async quest(@Args('id', ObjectIdPipe) id: string): Promise<Quest> {
        return this.questsService.findOne(id);
    }

    // quest(id) e questUpdated restano leggibili per id da ogni utente autenticato (13.1 D-05): snapshot alla subscribe come pendingRequestsUpdated, poi un evento a ogni update
    // e a ogni nascita o cambio della conclusione di un'aid nata dalla quest (quick 261113-aql);
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
