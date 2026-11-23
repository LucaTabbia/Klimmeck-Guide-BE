import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { QuestEnemy } from 'src/models/quest/quest-enemy.model';
import { knowsEnemyByOwnLore } from './lore-creature';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

// nemico conosciuto dal viewer (Phase 16 D-07, quick 261123-lcv): la lore propria del nemico è sbloccata, la stessa regola di Lore.enemy;
// la lore si legge dal nemico già popolato sulla voce: una lettura del viewer per richiesta o per evento, nessuna per voce
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
        return knowsEnemyByOwnLore(
            await this.viewers.of(identity, context, info),
            entry.enemy,
        );
    }
}
