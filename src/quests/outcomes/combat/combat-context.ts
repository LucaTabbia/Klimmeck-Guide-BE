import { Types } from 'mongoose';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SlotType } from 'src/models/enums/slot_type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { refIdOf } from 'src/mongo/document-id';
import { statusFactsOf } from '../progression/status-facts';
import {
    CombatContext,
    CombatDamages,
    CombatEnemy,
    CombatParticipant,
    DamageEntry,
} from './combat-resolver';

export interface CombatCharacterSnapshot {
    _id: Types.ObjectId;
    status: {
        title: TitleType;
        xp?: number;
        level?: number;
        currentLifePoints?: number;
        maxLifePoints?: number;
        injuries?: InjuryType[];
    };
    assets?: {
        wearedEquipment?: Partial<Record<SlotType, unknown>> | null;
        activeSpells?: { spell?: unknown; usages?: number }[];
        ownedItems?: { itemType?: string; item?: unknown; quantity?: number }[];
    } | null;
}

export interface CombatEnemySnapshot {
    _id: Types.ObjectId;
    name?: string;
    lifePoints?: number;
    xp?: number;
    damages?: unknown;
    baseWeaknesses?: string[];
    energyWeaknesses?: string[];
}

export interface CombatHydration {
    quest: { _id: Types.ObjectId; infos: { type: QuestType; title: string } };
    enemy: CombatEnemySnapshot;
    participants: CombatCharacterSnapshot[];
    equipment: ReadonlyMap<string, { damages?: unknown }>;
    spells: ReadonlyMap<string, { energyDamage?: unknown }>;
    loot: ReadonlyMap<string, { effect?: unknown; power?: unknown }>;
}

export interface CombatCatalogRefs {
    equipmentIds: Types.ObjectId[];
    spellIds: Types.ObjectId[];
    lootIds: Types.ObjectId[];
}

const LOOT_ITEM_TYPE = 'LootItem';
const KNOWN_EFFECTS: ReadonlySet<unknown> = new Set(Object.values(EffectType));

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringsOf = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];

const entriesOf = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    return isRecord(value) ? [value] : [];
};

const damageEntryOf = (value: unknown): DamageEntry | null => {
    if (!isRecord(value) || typeof value.type !== 'string') return null;
    const power = numberOr(value.power, -1);
    return power >= 0 ? { type: value.type, power } : null;
};

const damageEntriesOf = (value: unknown): DamageEntry[] =>
    entriesOf(value)
        .map(damageEntryOf)
        .filter((entry): entry is DamageEntry => entry !== null);

// un documento del catalogo può avere `base` salvato come oggetto singolo (Pitfall 10): nessuna eccezione, solo voci valide
export function normalizeDamages(raw: unknown): CombatDamages {
    const damages = isRecord(raw) ? raw : {};
    return {
        base: damageEntriesOf(damages.base),
        energy: damageEntriesOf(damages.energy),
    };
}

const refOf = (value: unknown): Types.ObjectId | null =>
    refIdOf(value) ?? (isRecord(value) ? refIdOf(value._id) : null);

const wornOf = (snapshot: CombatCharacterSnapshot) =>
    Object.values(SlotType).flatMap((slot) => {
        const itemId = refOf(snapshot.assets?.wearedEquipment?.[slot]);
        return itemId ? [{ slot, itemId }] : [];
    });

const activeSpellsOf = (snapshot: CombatCharacterSnapshot) =>
    (snapshot.assets?.activeSpells ?? []).flatMap((entry) => {
        const spellId = refOf(entry?.spell);
        return spellId
            ? [{ spellId, usages: Math.max(0, numberOr(entry.usages, 0)) }]
            : [];
    });

const ownedLootOf = (snapshot: CombatCharacterSnapshot) =>
    (snapshot.assets?.ownedItems ?? []).flatMap((entry) => {
        const itemId = refOf(entry?.item);
        const quantity = numberOr(entry?.quantity, 0);
        return entry?.itemType === LOOT_ITEM_TYPE && itemId && quantity >= 1
            ? [{ itemId, quantity }]
            : [];
    });

const uniqueIds = (ids: Types.ObjectId[]): Types.ObjectId[] => [
    ...new Map(ids.map((id) => [id.toHexString(), id])).values(),
];

export function combatCatalogRefsOf(
    participants: readonly CombatCharacterSnapshot[],
): CombatCatalogRefs {
    return {
        equipmentIds: uniqueIds(
            participants.flatMap(wornOf).map(({ itemId }) => itemId),
        ),
        spellIds: uniqueIds(
            participants.flatMap(activeSpellsOf).map(({ spellId }) => spellId),
        ),
        lootIds: uniqueIds(
            participants.flatMap(ownedLootOf).map(({ itemId }) => itemId),
        ),
    };
}

const effectOf = (value: unknown): EffectType | null =>
    KNOWN_EFFECTS.has(value) ? (value as EffectType) : null;

// HP e livello dagli stessi fatti del piano esiti (WR-01): il resolver vede gli stessi "prima" del foglio
const participantOf = (
    snapshot: CombatCharacterSnapshot,
    hydration: CombatHydration,
): CombatParticipant => {
    const facts = statusFactsOf(snapshot);
    return {
        characterId: snapshot._id.toHexString(),
        title: snapshot.status.title,
        level: facts.level,
        currentLifePoints: facts.currentLifePoints,
        maxLifePoints: facts.maxLifePoints,
        injuries: [...(snapshot.status.injuries ?? [])],
        equipment: wornOf(snapshot).flatMap(({ slot, itemId }) => {
            const item = hydration.equipment.get(itemId.toHexString());
            return item
                ? [
                      {
                          itemId: itemId.toHexString(),
                          slot,
                          damages: normalizeDamages(item.damages),
                      },
                  ]
                : [];
        }),
        activeSpells: activeSpellsOf(snapshot).flatMap(
            ({ spellId, usages }) => {
                const spell = hydration.spells.get(spellId.toHexString());
                return spell
                    ? [
                          {
                              spellId: spellId.toHexString(),
                              usages,
                              damage: damageEntryOf(spell.energyDamage),
                          },
                      ]
                    : [];
            },
        ),
        consumables: ownedLootOf(snapshot).flatMap(({ itemId, quantity }) => {
            const loot = hydration.loot.get(itemId.toHexString());
            return loot
                ? [
                      {
                          itemId: itemId.toHexString(),
                          quantity,
                          effect: effectOf(loot.effect),
                          power: numberOr(loot.power, 0),
                      },
                  ]
                : [];
        }),
    };
};

const enemyOf = (enemy: CombatEnemySnapshot): CombatEnemy => ({
    id: enemy._id.toHexString(),
    name: enemy.name ?? '',
    lifePoints: numberOr(enemy.lifePoints, 0),
    xp: numberOr(enemy.xp, 0),
    damages: normalizeDamages(enemy.damages),
    baseWeaknesses: stringsOf(enemy.baseWeaknesses),
    energyWeaknesses: stringsOf(enemy.energyWeaknesses),
});

// funzione pura: gli snapshot e le mappe del catalogo sono letti dal servizio, qui nessun I/O; ordine per id = esiti riproducibili
export function buildCombatContext(hydration: CombatHydration): CombatContext {
    return {
        quest: {
            id: hydration.quest._id.toHexString(),
            type: hydration.quest.infos.type,
            title: hydration.quest.infos.title,
        },
        enemy: enemyOf(hydration.enemy),
        participants: hydration.participants
            .map((snapshot) => participantOf(snapshot, hydration))
            .sort((a, b) => a.characterId.localeCompare(b.characterId)),
    };
}
