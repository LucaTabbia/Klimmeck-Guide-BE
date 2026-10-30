import { Inject } from '@nestjs/common';
import { Resolver, Query, Args, Subscription } from '@nestjs/graphql';
import { filter, pipe } from '@graphql-yoga/subscription';
import type { PubSub } from '@graphql-yoga/subscription';
import { UsersService } from './users.service';
import { User } from 'src/models/user.model';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { subscribeWithSnapshot } from 'src/graphql/subscribe-with-snapshot';
import { RoleType } from 'src/models/enums/role-type.enum';
import { documentIdOf } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => User)
export class UsersResolver {
    constructor(
        private usersService: UsersService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    @Roles(RoleType.innkeeper)
    @Query(() => [User])
    async users(): Promise<User[]> {
        return this.usersService.findAll();
    }

    @Roles(RoleType.innkeeper)
    @Query(() => User)
    async user(@Args('id', ObjectIdPipe) id: string): Promise<User> {
        return this.usersService.findOne(id);
    }

    // l'identità è solo quella del connection_init: nessun argomento, nessun client ascolta un altro utente (D-01)
    @Subscription(() => User, { name: 'userUpdated' })
    userUpdated(
        @CurrentUser() identity: AuthIdentity,
    ): Promise<AsyncIterableIterator<{ userUpdated: User }>> {
        const live = pipe(
            this.pubSub.subscribe('userUpdated'),
            filter(
                ({ userUpdated }) =>
                    documentIdOf(userUpdated) === identity.userId,
            ),
        );
        return subscribeWithSnapshot(live, async () => ({
            userUpdated: await this.usersService.findOne(identity.userId),
        }));
    }
}
