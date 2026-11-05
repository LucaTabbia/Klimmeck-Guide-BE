import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { toCopper, type CoinPurse } from 'src/economy/coins';
import type {
    InventoryEntry,
    InventorySnapshot,
} from 'src/economy/trade/trade-inventory';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { refIdOf, sameId } from 'src/mongo/document-id';
import type { TravelFoodItem } from 'src/models/travel-food-item.model';
import type { TravelPreview } from 'src/models/travel-preview.model';
import {
    statusFactsOf,
    type StatusSnapshot,
} from 'src/quests/outcomes/progression/status-facts';
import type { ActiveTravelDraft } from '../travel-timing';
import type { ConsumedFood, FoodStack } from './food-selection';
import { planTravelFood, type TravelFoodPlan } from './travel-food';

export interface Pantry {
    stacks: FoodStack[];
    assets: InventorySnapshot;
    hpRaw: number | null | undefined;
    hpBefore: number;
}

export interface PlannedMeal {
    plan: TravelFoodPlan;
    pantry: Pantry;
}

export type TravelLeg = Pick<ActiveTravelDraft, 'duration' | 'road'>;

interface PantrySnapshot extends StatusSnapshot {
    assets?: { ownedItems?: InventoryEntry[] };
}

interface FoodCatalogEntry {
    _id: Types.ObjectId;
    power?: number;
    sellPrice?: Partial<CoinPurse> | null;
}

const LOOT_ITEM_TYPE = 'LootItem';

const PANTRY_PROJECTION = {
    'assets.ownedItems': 1,
    'status.currentLifePoints': 1,
    'status.maxLifePoints': 1,
    'status.xp': 1,
    'status.title': 1,
} as const;

const numberOrZero = (value: unknown): number =>
    typeof value === 'number' ? value : 0;

const lootIdsOf = (entries: readonly InventoryEntry[]): Types.ObjectId[] => [
    ...new Map(
        entries
            .filter((entry) => entry?.itemType === LOOT_ITEM_TYPE)
            .map((entry) => refIdOf(entry.item))
            .filter((id): id is Types.ObjectId => id !== null)
            .map((id) => [id.toHexString(), id]),
    ).values(),
];

// la validità di power e quantità la filtra selectFood (Phase 14 D-06)
const stacksOf = (
    entries: readonly InventoryEntry[],
    catalog: readonly FoodCatalogEntry[],
): FoodStack[] => {
    const byId = new Map(catalog.map((food) => [food._id.toHexString(), food]));
    return entries.flatMap((entry) => {
        const itemId =
            entry?.itemType === LOOT_ITEM_TYPE ? refIdOf(entry.item) : null;
        const food = itemId ? byId.get(itemId.toHexString()) : undefined;
        if (!itemId || !food) return [];
        return [
            {
                itemId,
                power: numberOrZero(food.power),
                sellCopper: toCopper(food.sellPrice),
                quantity: numberOrZero(entry.quantity),
            },
        ];
    });
};

// la dispensa del viaggiatore: cibo hunger nell'ordine dell'inventario + HP (Phase 14 D-12, D-17); in sessione dentro la transazione della partenza
@Injectable()
export class TravelPantryReader {
    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(LootItem.name)
        private readonly lootItemModel: Model<LootItemDocument>,
    ) {}

    // letture in sequenza (04 Pitfall 6): rieseguibile dal driver sui WriteConflict
    async read(
        characterId: Types.ObjectId,
        session: ClientSession | null = null,
    ): Promise<Pantry> {
        const snapshot = await this.characterModel
            .findOne(activeCharacterById(characterId), PANTRY_PROJECTION)
            .session(session)
            .lean<PantrySnapshot | null>()
            .exec();
        if (!snapshot) throw ResourceNotFoundException.character();
        const ownedItems = snapshot.assets?.ownedItems ?? [];
        const catalog = await this.foodCatalogOf(
            lootIdsOf(ownedItems),
            session,
        );
        return {
            stacks: stacksOf(ownedItems, catalog),
            assets: { ownedItems },
            hpRaw: snapshot.status.currentLifePoints,
            hpBefore: statusFactsOf(snapshot).currentLifePoints,
        };
    }

    async planFor(
        characterId: Types.ObjectId,
        travel: TravelLeg,
        session: ClientSession | null = null,
    ): Promise<PlannedMeal> {
        const pantry = await this.read(characterId, session);
        const plan = planTravelFood({
            durationMs: travel.duration,
            distanceKm: travel.road.distance,
            hpBefore: pantry.hpBefore,
            stacks: pantry.stacks,
        });
        return { pantry, plan };
    }

    async previewOf(
        characterId: Types.ObjectId,
        travel: TravelLeg,
    ): Promise<TravelPreview> {
        const { plan } = await this.planFor(characterId, travel);
        return {
            distance: travel.road.distance,
            duration: travel.duration,
            road: travel.road,
            food: await this.foodItemsOf(plan.consumed),
            hpLost: plan.hpLost,
            arrivesAlive: plan.arrivesAlive,
        };
    }

    // documenti idratati: id serve al filo (Pitfall 3); un oggetto sparito dal catalogo si salta
    async foodItemsOf(
        consumed: readonly ConsumedFood[],
    ): Promise<TravelFoodItem[]> {
        if (consumed.length === 0) return [];
        const documents = await this.lootItemModel
            .find({ _id: { $in: consumed.map(({ itemId }) => itemId) } })
            .exec();
        return consumed.flatMap(({ itemId, quantity }) => {
            const item = documents.find((document) =>
                sameId(document._id, itemId),
            );
            return item ? [{ item, quantity }] : [];
        });
    }

    private async foodCatalogOf(
        ids: Types.ObjectId[],
        session: ClientSession | null,
    ): Promise<FoodCatalogEntry[]> {
        if (ids.length === 0) return [];
        return this.lootItemModel
            .find(
                { _id: { $in: ids }, effect: EffectType.hunger },
                { power: 1, sellPrice: 1 },
            )
            .session(session)
            .lean<FoodCatalogEntry[]>()
            .exec();
    }
}
