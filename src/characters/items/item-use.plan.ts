import type { Types } from 'mongoose';
import {
    type PetCatalogFacts,
    petSlotGuardOf,
} from 'src/characters/pets/equip-pet.plan';
import {
    companionLifeAt,
    companionStoredLifeOf,
    isPetDefeated,
} from 'src/characters/pets/companion-life';
import {
    companionMaxLifeOf,
    companionStoredLevelOf,
} from 'src/characters/pets/companion-level';
import {
    type NewOwnedPetEntry,
    type OwnedPetEntry,
    normalisedOwnedPets,
} from 'src/characters/pets/owned-pet-entry';
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
import { relatedLoreIdsOf } from 'src/lore/related-lore-ids';
import { idForms, sameId } from 'src/mongo/document-id';
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

export const PET_POTION_CATALOG_PROJECTION = {
    maxLifePoints: 1,
    maxXp: 1,
    recoveryTime: 1,
} as const;

// lo slot e le voci dei compagni arrivano con la stessa proiezione `assets` (Phase 23 D-23)
export interface ItemUseAssetsSnapshot extends InventorySnapshot {
    pet?: unknown;
    ownedPets?: readonly OwnedPetEntry[] | null;
}

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
    assets?: ItemUseAssetsSnapshot | null;
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
    missionInProgress: boolean;
}

export interface PetPotionPlanInput extends ItemUsePlanInput {
    petId: Types.ObjectId;
    pet: PetCatalogFacts | null;
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

function refuseWhileOnMission(onMission: boolean): void {
    if (onMission) throw GameRuleException.missionInProgress();
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

function refuseWhileRecovering(
    until: unknown,
    now: Date,
    refusal: (until: Date) => GameRuleException,
): void {
    if (until instanceof Date && until.getTime() > now.getTime()) {
        throw refusal(until);
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
    // D-12: dopo il soccorso, prima di possesso, ricarica ed effetto (D-23)
    refuseWhileOnMission(input.missionInProgress);
    refuseUnlessOwned(snapshot.assets, itemId);
    const potion = usablePotionOf(input.item);
    refuseWhileRecovering(snapshot.status.potionRecoveryUntil, now, (until) =>
        GameRuleException.potionRecovering(until),
    );
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

interface CompanionHeal {
    hpBefore: number;
    hpAfter: number;
    level: number;
    resting: boolean;
}

function ownedCompanionOf(
    assets: ItemUseAssetsSnapshot | null | undefined,
    petId: Types.ObjectId,
): OwnedPetEntry {
    const entry = (assets?.ownedPets ?? []).find((owned) =>
        sameId(owned?.pet, petId),
    );
    if (!entry) throw GameRuleException.petNotOwned();
    return entry;
}

function refuseUnfitCompanion(entry: OwnedPetEntry, now: Date): void {
    if (isPetDefeated(entry, now)) throw GameRuleException.petDefeated();
    refuseWhileRecovering(entry.potionRecoveryUntil, now, (until) =>
        GameRuleException.petPotionRecovering(until),
    );
}

// vita di adesso con la regola del riposo e tetto al massimo DEL COMPAGNO (D-07, D-38): una voce mai toccata dalla fase è piena
function companionHealOf(
    input: PetPotionPlanInput,
    entry: OwnedPetEntry,
    power: number,
): CompanionHeal {
    const { snapshot, petId, pet, now } = input;
    const maxLifePoints = companionMaxLifeOf(entry, pet);
    if (maxLifePoints === null) throw GameRuleException.itemNoEffect();
    const resting = !sameId(snapshot.assets?.pet, petId);
    const { lifePoints } = companionLifeAt({
        lifePoints: companionStoredLifeOf(entry, maxLifePoints),
        lifeAsOf: entry.lifeAsOf,
        resting,
        maxLifePoints,
        recoveryTimeMs: pet?.recoveryTime,
        now,
    });
    const hpAfter = Math.min(maxLifePoints, Math.floor(lifePoints + power));
    if (hpAfter === lifePoints) throw GameRuleException.itemNoEffect();
    return {
        hpBefore: lifePoints,
        hpAfter,
        level: companionStoredLevelOf(entry, pet),
        resting,
    };
}

// a riposo l'ancora riparte da adesso, nello slot non c'è ancora (D-04, D-07); l'attesa è della sola voce (D-05)
function healedEntry(
    entry: NewOwnedPetEntry,
    heal: CompanionHeal,
    recoveryUntil: Date,
    now: Date,
): NewOwnedPetEntry {
    const healed: NewOwnedPetEntry = {
        ...entry,
        currentLifePoints: heal.hpAfter,
        level: heal.level,
        potionRecoveryUntil: recoveryUntil,
    };
    if (heal.resting) healed.lifeAsOf = now;
    else delete healed.lifeAsOf;
    return healed;
}

function ownedPetsAfterPotion(
    entries: readonly OwnedPetEntry[] | null | undefined,
    petId: Types.ObjectId,
    heal: (entry: NewOwnedPetEntry) => NewOwnedPetEntry,
): NewOwnedPetEntry[] {
    const ownedPets = normalisedOwnedPets(entries);
    const target = ownedPets.findIndex((entry) => entry.pet.equals(petId));
    return ownedPets.map((entry, index) =>
        index === target ? heal(entry) : entry,
    );
}

// la voce come letta, assente = null (Pitfall 5): una seconda pozione concorrente non combacia più (D-23, T-23-18)
function companionGuardOf(
    snapshot: ItemUseCharacterSnapshot,
    entry: OwnedPetEntry,
    petId: Types.ObjectId,
    drink: TradeLine,
): Record<string, unknown> {
    return {
        ...activeCharacterById(snapshot._id),
        'status.awaitingAid': null,
        'assets.pet': petSlotGuardOf(snapshot.assets?.pet),
        'assets.ownedPets': {
            $elemMatch: {
                pet: { $in: idForms(petId) },
                currentLifePoints: entry.currentLifePoints ?? null,
                lifeAsOf: recoveryAsRead(entry.lifeAsOf),
                potionRecoveryUntil: recoveryAsRead(entry.potionRecoveryUntil),
                defeatedUntil: recoveryAsRead(entry.defeatedUntil),
            },
        },
        ...soldQuantityGuards([drink]),
    };
}

// gemello di planItemUse per il compagno (Phase 23 D-05, D-06, D-07, D-32): stessi primi rifiuti, poi quelli della voce; nessuna ferita, nessuna attesa del personaggio
export function planPetPotion(input: PetPotionPlanInput): ItemUsePlan {
    const { snapshot, itemId, petId, now } = input;
    refuseWhileAwaitingAid(snapshot);
    refuseWhileOnMission(input.missionInProgress);
    refuseUnlessOwned(snapshot.assets, itemId);
    const potion = usablePotionOf(input.item);
    const entry = ownedCompanionOf(snapshot.assets, petId);
    refuseUnfitCompanion(entry, now);
    const heal = companionHealOf(input, entry, potion.power);

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
        filter: companionGuardOf(snapshot, entry, petId, drink),
        update: {
            $set: {
                'assets.ownedPets': ownedPetsAfterPotion(
                    snapshot.assets?.ownedPets,
                    petId,
                    (owned) => healedEntry(owned, heal, recoveryUntil, now),
                ),
                'assets.ownedItems': ownedItems,
            },
            ...knowledge.addition,
        },
        outcome: {
            hpBefore: heal.hpBefore,
            hpAfter: heal.hpAfter,
            injuriesHealed: [],
            quantityLeft: quantityLeftOf(ownedItems, itemId),
            recoveryUntil,
            loreUnlocked: knowledge.fresh,
        },
    };
}
