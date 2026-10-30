import { Inject } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import type { PubSub } from '@graphql-yoga/subscription';
import { AuditTarget } from 'src/authz/audit/audit-target.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { subscribeWithSnapshot } from 'src/graphql/subscribe-with-snapshot';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PendingRequest } from 'src/models/pending-request.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { CompletePendingRequestInput } from 'src/models/request/complete-pending-request.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { GmCompletionService } from 'src/quests/outcomes/gm-completion.service';
import { QuestResultsService } from 'src/quests/results/quest-results.service';
import { PendingRequestsService } from './pending-requests.service';

@Resolver(() => PendingRequest)
export class PendingRequestsResolver {
    constructor(
        private readonly requests: PendingRequestsService,
        private readonly completion: GmCompletionService,
        private readonly results: QuestResultsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    @Roles(RoleType.innkeeper)
    @Query(() => [PendingRequest])
    pendingRequests(): Promise<PendingRequest[]> {
        return this.requests.list();
    }

    // snapshot alla subscribe come userUpdated (D-22): il listener è agganciato prima della lettura, nessun evento perso
    @Roles(RoleType.innkeeper)
    @Subscription(() => [PendingRequest], { name: 'pendingRequestsUpdated' })
    pendingRequestsUpdated(): Promise<
        AsyncIterableIterator<{ pendingRequestsUpdated: PendingRequest[] }>
    > {
        return subscribeWithSnapshot(
            this.pubSub.subscribe('pendingRequestsUpdated'),
            async () => ({
                pendingRequestsUpdated: await this.requests.list(),
            }),
        );
    }

    // solo esito positivo, override opzionali per personaggio (D-03, D-04); audit automatico dell'interceptor (D-23): target PendingQuest dichiarato (D-17c)
    @Roles(RoleType.innkeeper)
    @AuditTarget(
        'PendingQuest',
        ({ input }) => (input as { pendingQuestId?: unknown })?.pendingQuestId,
    )
    @Mutation(() => [QuestResult])
    async completePendingRequest(
        @Args('input', { type: () => CompletePendingRequestInput })
        input: CompletePendingRequestInput,
    ): Promise<QuestResult[]> {
        const drafts = await this.completion.complete(input);
        return this.results.readCommitted(drafts);
    }
}
