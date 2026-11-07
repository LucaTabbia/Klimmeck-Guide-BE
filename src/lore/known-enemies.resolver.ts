import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { QuestEnemy } from 'src/models/quest/quest-enemy.model';
import { knowsEnemy } from './lore-visibility';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

// nemico conosciuto dal viewer (Phase 16 D-06, D-07): l'id esatto, mai la specie; una lettura per richiesta o per evento
@Resolver(() => QuestEnemy)
export class KnownEnemiesResolver {
    constructor(private readonly viewers: ViewerKnowledgeService) {}

    @ResolveField('known', () => Boolean)
    async known(
        @Parent() entry: QuestEnemy,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<boolean> {
        return knowsEnemy(
            await this.viewers.of(identity, context, info),
            entry.enemy,
        );
    }
}
