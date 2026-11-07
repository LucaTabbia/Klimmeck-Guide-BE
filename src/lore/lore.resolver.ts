import { Args, Context, Info, Query, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Lore } from 'src/models/lore.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';
import { LoreService } from './lore.service';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

@Resolver(() => Lore)
export class LoreResolver {
    constructor(
        private loresService: LoreService,
        private readonly viewers: ViewerKnowledgeService,
    ) {}

    @Query(() => [Lore])
    async lores(
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore[]> {
        return this.loresService.findAll(
            await this.viewers.of(identity, context, info),
        );
    }

    @Query(() => Lore)
    async lore(
        @Args('id', ObjectIdPipe) id: string,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore> {
        return this.loresService.findOne(
            id,
            await this.viewers.of(identity, context, info),
        );
    }
}
