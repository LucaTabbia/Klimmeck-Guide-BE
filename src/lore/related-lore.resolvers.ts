import { Injectable } from '@nestjs/common';
import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { InjectModel } from '@nestjs/mongoose';
import type { GraphQLResolveInfo } from 'graphql';
import { Model } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { LootItem } from 'src/models/loot-item.model';
import { Lore, LoreDocument } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import { isResolvedRef } from 'src/quests/quest-catalog.populate';
import { isVisible, visibleLoreIdsOf, visibleRelated } from './lore-visibility';
import { ViewerKnowledgeService } from './viewer-knowledge.service';

// relatedLore per viewer (Phase 16 D-10, Phase 18 D-19): sul tipo, non sulla query, così copre ogni percorso
// (cityShop.city, PointOfInterest.city, lore annidate, LootItem e Pet in negozio, inventario, premi e fogli);
// i ref non popolati si scartano (Pitfall 9), tranne per LootItem e Pet che le caricano per id

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

// le lore di un oggetto o di un pet non arrivano mai popolate (Phase 18 D-19, Phase 19 D-26): si caricano per id
// le sole visibili al viewer; nessuna query se non ce ne sono; nessuna memo per richiesta, l'N+1 dell'oste è dichiarato
@Injectable()
export class VisibleLoreLoader {
    constructor(
        private readonly viewers: ViewerKnowledgeService,
        @InjectModel(Lore.name) private readonly loreModel: Model<LoreDocument>,
    ) {}

    async load(
        refs: readonly unknown[] | null | undefined,
        identity: AuthIdentity | undefined,
        context: object,
        info: GraphQLResolveInfo,
    ): Promise<Lore[]> {
        const viewer = await this.viewers.of(identity, context, info);
        const ids = visibleLoreIdsOf(viewer, refs);
        if (ids.length === 0) return [];
        const found = await this.loreModel.find({ _id: { $in: ids } }).exec();
        const byHex = new Map(found.map((lore) => [lore.id as string, lore]));
        return ids.flatMap((id) => byHex.get(id.toHexString()) ?? []);
    }
}

@Resolver(() => LootItem)
export class LootItemRelatedLoreResolver {
    constructor(private readonly lore: VisibleLoreLoader) {}

    @ResolveField('relatedLore', () => [Lore])
    relatedLore(
        @Parent() loot: LootItem,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore[]> {
        return this.lore.load(loot.relatedLore, identity, context, info);
    }
}

@Resolver(() => Pet)
export class PetRelatedLoreResolver {
    constructor(private readonly lore: VisibleLoreLoader) {}

    @ResolveField('relatedLore', () => [Lore])
    relatedLore(
        @Parent() pet: Pet,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<Lore[]> {
        return this.lore.load(pet.relatedLore, identity, context, info);
    }
}
