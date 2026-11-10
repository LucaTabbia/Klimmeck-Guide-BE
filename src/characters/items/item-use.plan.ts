import type { Types } from 'mongoose';
import { recoveryDueAt } from 'src/characters/spells/spell-state.snapshot';
import {
    applyTradeToInventory,
    type InventorySnapshot,
    soldQuantityGuards,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import type { KnowledgeAddition } from 'src/lore/knowledge-addition';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import { refIdOf, sameId } from 'src/mongo/document-id';
import { cureInjuries } from 'src/quests/outcomes/injuries/cure-injuries';
import { lifePointsWithin } from 'src/quests/outcomes/progression/level-table';
import { statusFactsOf } from 'src/quests/outcomes/progression/status-facts';
import { knowledgeUpdateOf } from 'src/quests/outcomes/victory-knowledge';

// bevuta dal Diario (Phase 18 D-17): piano puro dallo snapshot in sessione, una sola scrittura condizionale; il filtro è la rete di sicurezza, la contesa la risolve il WriteConflict della transazione (D-22)

export const ITEM_USE_CHARACTER_PROJECTION = { status: 1, assets: 1 } as const;
export const ITEM_USE_CATALOG_PROJECTION = {
    effect: 1,
    power: 1,
    canHeal: 1,
    recovery: 1,
    relatedLore: 1,
} as const;

export interface ItemUseCharacterSnapshot {
    _id: Types.ObjectId;
    status: {
        title: TitleType;
        xp?: number;
        level?: number;
        currentLifePoints?: number;
        maxLifePoints?: number;
        injuries?: InjuryType[];
        awaitingAid?: unknown;
        potionRecoveryUntil?: unknown;
        unlockedLore?: unknown[];
    };
    assets?: InventorySnapshot | null;
}

// oggetto di catalogo letto lean: Mongoose non valida gli update e gli script di contenuto usano il driver nativo (D-23)
export interface ItemUseCatalogSnapshot {
    effect?: unknown;
    power?: unknown;
    canHeal?: unknown;
    recovery?: unknown;
    relatedLore?: unknown;
}

export interface ItemUsePlanInput {
    snapshot: ItemUseCharacterSnapshot;
    itemId: Types.ObjectId;
    item: ItemUseCatalogSnapshot | null;
    now: Date;
}

export interface ItemUseOutcome {
    hpBefore: number;
    hpAfter: number;
    injuriesHealed: InjuryType[];
    quantityLeft: number;
    recoveryUntil: Date;
    loreUnlocked: Types.ObjectId[];
}

export interface ItemUsePlan {
    filter: Record<string, unknown>;
    update: {
        $set: Record<string, unknown>;
        $addToSet?: KnowledgeAddition['$addToSet'];
    };
    outcome: ItemUseOutcome;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// stessa unità di Spell.recoveryTime (ms); 0 o una forma non intera danno una pozione senza ricarica (D-23)
export function recoveryTimeOf(recovery: unknown): number | null {
    if (!isRecord(recovery)) return null;
    const { time } = recovery;
    return typeof time === 'number' && Number.isSafeInteger(time) && time > 0
        ? time
        : null;
}

const powerOf = (power: unknown): number =>
    typeof power === 'number' && Number.isFinite(power) && power > 0
        ? power
        : 0;

const canHealOf = (canHeal: unknown): readonly unknown[] =>
    Array.isArray(canHeal) ? canHeal : [];

const isObjectId = (id: Types.ObjectId | null): id is Types.ObjectId =>
    id !== null;

const relatedLoreIdsOf = (relatedLore: unknown): Types.ObjectId[] =>
    Array.isArray(relatedLore)
        ? relatedLore.map(refIdOf).filter(isObjectId)
        : [];

const drinkLineOf = (itemId: Types.ObjectId): TradeLine => ({
    direction: 'sell',
    kind: 'LootItem',
    itemId,
    quantity: 1,
});

// legacy senza il campo compresi (Pitfall 5); in ricarica solo se until è oltre now (Pitfall 6)
const recoveryOver = (now: Date) => ({
    $or: [
        { 'status.potionRecoveryUntil': null },
        { 'status.potionRecoveryUntil': { $lte: now } },
    ],
});

function quantityLeftOf(
    ownedItems: readonly { item: unknown; quantity: number }[],
    itemId: Types.ObjectId,
): number {
    return (
        ownedItems.find((entry) => sameId(entry.item, itemId))?.quantity ?? 0
    );
}

export function planItemUse(input: ItemUsePlanInput): ItemUsePlan {
    const { snapshot, itemId, now } = input;
    const item = input.item ?? {};
    const drink = drinkLineOf(itemId);
    const injuries = snapshot.status.injuries ?? [];
    const facts = statusFactsOf(snapshot);
    const hpAfter = lifePointsWithin(
        facts.currentLifePoints + powerOf(item.power),
        facts.maxLifePoints,
    );
    const cured = cureInjuries(injuries, canHealOf(item.canHeal));
    const { ownedItems } = applyTradeToInventory(snapshot.assets ?? {}, [
        drink,
    ]);
    const recoveryUntil = recoveryDueAt(
        now,
        recoveryTimeOf(item.recovery) ?? 0,
    );
    const knowledge = knowledgeUpdateOf(
        snapshot.status.unlockedLore,
        relatedLoreIdsOf(item.relatedLore),
    );
    return {
        filter: {
            ...activeCharacterById(snapshot._id),
            'status.awaitingAid': null,
            'status.currentLifePoints':
                snapshot.status.currentLifePoints ?? null,
            'status.injuries': [...injuries],
            ...soldQuantityGuards([drink], [recoveryOver(now)]),
        },
        update: {
            $set: {
                'status.currentLifePoints': hpAfter,
                'status.injuries': cured.injuries,
                'assets.ownedItems': ownedItems,
                'status.potionRecoveryUntil': recoveryUntil,
            },
            ...knowledge.addition,
        },
        outcome: {
            hpBefore: facts.currentLifePoints,
            hpAfter,
            injuriesHealed: cured.healed,
            quantityLeft: quantityLeftOf(ownedItems, itemId),
            recoveryUntil,
            loreUnlocked: knowledge.fresh,
        },
    };
}
