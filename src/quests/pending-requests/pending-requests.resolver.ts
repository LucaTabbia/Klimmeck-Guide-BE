import { Inject } from '@nestjs/common';
import { Query, Resolver, Subscription } from '@nestjs/graphql';
import type { PubSub } from '@graphql-yoga/subscription';
import { Roles } from 'src/authz/roles/roles.decorator';
import { subscribeWithSnapshot } from 'src/graphql/subscribe-with-snapshot';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PendingRequest } from 'src/models/pending-request.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { PendingRequestsService } from './pending-requests.service';

@Resolver(() => PendingRequest)
export class PendingRequestsResolver {
    constructor(
        private readonly requests: PendingRequestsService,
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
}
