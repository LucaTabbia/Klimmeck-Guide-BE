import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { Lore } from 'src/models/lore.model';
import { isResolvedRef } from 'src/quests/quest-catalog.populate';
import { isVisible, visibleRelated } from './lore-visibility';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

// relatedLore per viewer (Phase 16 D-10): sul tipo, non sulla query, così copre ogni percorso
// (cityShop.city, PointOfInterest.city, lore annidate); i ref non popolati si scartano (Pitfall 9)

@Resolver(() => Lore)
export class LoreRelatedLoreResolver {
    constructor(private readonly viewers: ViewerKnowledgeService) {}

    @ResolveField('relatedLore', () => [Lore])
    async relatedLore(
        @Parent() lore: Lore,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore[]> {
        const viewer = await this.viewers.of(identity, context, info);
        return visibleRelated(viewer, lore.relatedLore);
    }
}

@Resolver(() => City)
export class CityRelatedLoreResolver {
    constructor(private readonly viewers: ViewerKnowledgeService) {}

    @ResolveField('relatedLore', () => Lore, { nullable: true })
    async relatedLore(
        @Parent() city: City,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore | null> {
        const lore = city.relatedLore;
        if (!isResolvedRef(lore)) return null;
        const viewer = await this.viewers.of(identity, context, info);
        return isVisible(viewer, lore) ? (lore as Lore) : null;
    }
}

@Resolver(() => Enemy)
export class EnemyRelatedLoreResolver {
    constructor(private readonly viewers: ViewerKnowledgeService) {}

    @ResolveField('relatedLore', () => [Lore])
    async relatedLore(
        @Parent() enemy: Enemy,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore[]> {
        const viewer = await this.viewers.of(identity, context, info);
        return visibleRelated(viewer, enemy.relatedLore);
    }
}
