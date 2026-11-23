import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Enemy } from 'src/models/enemy.model';
import { Lore } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import { visibleLoreHexOf } from './lore-creature';
import { LoreCreatureLoader } from './lore-creature.loader';
import {
    viewerCacheKeyOf,
    ViewerKnowledgeService,
} from './viewer-knowledge.service';

// il nemico o il pet di una lore, solo per chi l'ha sbloccata (quick 261123-lcv): sul tipo, così copre ogni percorso che serve una Lore;
// una lore chiusa non genera nessuna lettura, le altre si leggono a blocchi
@Resolver(() => Lore)
export class LoreCreatureResolver {
    constructor(
        private readonly viewers: ViewerKnowledgeService,
        private readonly creatures: LoreCreatureLoader,
    ) {}

    @ResolveField('enemy', () => Enemy, { nullable: true })
    async enemy(
        @Parent() lore: unknown,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info?: { rootValue?: unknown },
    ): Promise<Enemy | null> {
        const viewer = await this.viewers.of(identity, context, info);
        const loreHex = visibleLoreHexOf(viewer, lore);
        if (loreHex === undefined) return null;
        return this.creatures.enemyOf(viewerCacheKeyOf(context, info), loreHex);
    }

    @ResolveField('pet', () => Pet, { nullable: true })
    async pet(
        @Parent() lore: unknown,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info?: { rootValue?: unknown },
    ): Promise<Pet | null> {
        const viewer = await this.viewers.of(identity, context, info);
        const loreHex = visibleLoreHexOf(viewer, lore);
        if (loreHex === undefined) return null;
        return this.creatures.petOf(viewerCacheKeyOf(context, info), loreHex);
    }
}
