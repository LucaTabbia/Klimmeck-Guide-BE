import type { Types } from 'mongoose';
import { recoveryDueAt } from 'src/characters/spells/spell-state.snapshot';
import {
    applyTradeToInventory,
    type InventorySnapshot,
    soldQuantityGuards,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import type { KnowledgeAddition } from 'src/lore/knowledge-addition';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { EffectType } from 'src/models/enums/effect-type.enum';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import { MAX_RECOVERY_VALUE } from 'src/models/loot-item.model';
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

// stessa unità di Spell.recoveryTime (ms); 0, una forma non intera o un valore oltre l'Int GraphQL danno una pozione senza ricarica (D-23)
export function recoveryTimeOf(recovery: unknown): number | null {
    if (!isRecord(recovery)) return null;
    const { time } = recovery;
    return typeof time === 'number' &&
        Number.isInteger(time) &&
        time > 0 &&
        time <= MAX_RECOVERY_VALUE
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

interface UsablePotion {
    power: number;
    canHeal: readonly unknown[];
    recoveryTime: number;
    relatedLore: Types.ObjectId[];
}

interface DrinkEffect {
    hpBefore: number;
    hpAfter: number;
    cured: { injuries: InjuryType[]; healed: InjuryType[] };
}

// ordine dei rifiuti deciso dallo snapshot (Phase 18 D-17), mai rileggendo dopo una scrittura fallita

function refuseWhileAwaitingAid(snapshot: ItemUseCharacterSnapshot): void {
    if (snapshot.status.awaitingAid != null) {
        throw GameRuleException.awaitingAid();
    }
}

function refuseUnlessOwned(
    assets: InventorySnapshot | null | undefined,
    itemId: Types.ObjectId,
): void {
    const owned = (assets?.ownedItems ?? []).some(
        (entry) =>
            sameId(entry.item, itemId) &&
            Number.isInteger(entry.quantity) &&
            entry.quantity >= 1,
    );
    if (!owned) throw GameRuleException.itemNotOwned();
}

function usablePotionOf(item: ItemUseCatalogSnapshot | null): UsablePotion {
    const recoveryTime = recoveryTimeOf(item?.recovery);
    if (!item || item.effect !== EffectType.heal || recoveryTime === null) {
        throw GameRuleException.itemNotUsable();
    }
    return {
        power: powerOf(item.power),
        canHeal: canHealOf(item.canHeal),
        recoveryTime,
        relatedLore: relatedLoreIdsOf(item.relatedLore),
    };
}

function refuseWhileRecovering(until: unknown, now: Date): void {
    if (until instanceof Date && until.getTime() > now.getTime()) {
        throw GameRuleException.potionRecovering(until);
    }
}

function refuseWithoutEffect(effect: DrinkEffect): void {
    if (
        effect.hpAfter === effect.hpBefore &&
        effect.cured.healed.length === 0
    ) {
        throw GameRuleException.itemNoEffect();
    }
}

function drinkEffectOf(
    snapshot: ItemUseCharacterSnapshot,
    potion: UsablePotion,
): DrinkEffect {
    const { currentLifePoints, maxLifePoints } = statusFactsOf(snapshot);
    const healed = lifePointsWithin(
        currentLifePoints + potion.power,
        maxLifePoints,
    );
    // il massimo limita la cura, non ridimensiona una vita già oltre (stesso principio di D-02)
    return {
        hpBefore: currentLifePoints,
        hpAfter: Number.isFinite(currentLifePoints)
            ? Math.max(currentLifePoints, healed)
            : healed,
        cured: cureInjuries(snapshot.status.injuries ?? [], potion.canHeal),
    };
}

function quantityLeftOf(
    ownedItems: readonly { item: unknown; quantity: number }[],
    itemId: Types.ObjectId,
): number {
    return (
        ownedItems.find((entry) => sameId(entry.item, itemId))?.quantity ?? 0
    );
}

// Mongoose fa il cast del filtro sul path Date: un testo non passerebbe e un numero diventerebbe un'altra data;
// la forma «non data», che il piano legge come ricarica finita, si pinna per tipo e non combacia con una ricarica scritta nel frattempo
const recoveryAsRead = (until: unknown): unknown =>
    until == null || until instanceof Date
        ? (until ?? null)
        : { $not: { $type: 'date' } };

// ripete ciò che il piano ha letto, assente = null (Pitfall 5): una forma che il piano accetta deve combaciare, altrimenti ITEM_NOT_OWNED perpetuo (D-23)
function writeGuardOf(
    snapshot: ItemUseCharacterSnapshot,
    drink: TradeLine,
): Record<string, unknown> {
    const { currentLifePoints, injuries, potionRecoveryUntil } =
        snapshot.status;
    return {
        ...activeCharacterById(snapshot._id),
        'status.awaitingAid': null,
        'status.currentLifePoints': currentLifePoints ?? null,
        'status.injuries': injuries ?? null,
        'status.potionRecoveryUntil': recoveryAsRead(potionRecoveryUntil),
        ...soldQuantityGuards([drink]),
    };
}

export function planItemUse(input: ItemUsePlanInput): ItemUsePlan {
    const { snapshot, itemId, now } = input;
    refuseWhileAwaitingAid(snapshot);
    refuseUnlessOwned(snapshot.assets, itemId);
    const potion = usablePotionOf(input.item);
    refuseWhileRecovering(snapshot.status.potionRecoveryUntil, now);
    const effect = drinkEffectOf(snapshot, potion);
    refuseWithoutEffect(effect);

    const drink = drinkLineOf(itemId);
    const { ownedItems } = applyTradeToInventory(snapshot.assets ?? {}, [
        drink,
    ]);
    const recoveryUntil = recoveryDueAt(now, potion.recoveryTime);
    const knowledge = knowledgeUpdateOf(
        snapshot.status.unlockedLore,
        potion.relatedLore,
    );
    return {
        filter: writeGuardOf(snapshot, drink),
        update: {
            $set: {
                'status.currentLifePoints': effect.hpAfter,
                'status.injuries': effect.cured.injuries,
                'assets.ownedItems': ownedItems,
                'status.potionRecoveryUntil': recoveryUntil,
            },
            ...knowledge.addition,
        },
        outcome: {
            hpBefore: effect.hpBefore,
            hpAfter: effect.hpAfter,
            injuriesHealed: effect.cured.healed,
            quantityLeft: quantityLeftOf(ownedItems, itemId),
            recoveryUntil,
            loreUnlocked: knowledge.fresh,
        },
    };
}
