import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { SlotType } from 'src/models/enums/slot_type.enum';
import {
    CombatCharacterSnapshot,
    isRecord,
    refOf,
} from '../combat/combat-context';
import { CombatContext } from '../combat/combat-resolver';
import { isPositiveInteger } from '../outcome-numbers';
import { DungeonContext, RecommendedEntry } from './dungeon-resolver';

export interface DungeonContextInput {
    combat: CombatContext;
    recommendedLoot: unknown[] | null | undefined;
    participants: readonly CombatCharacterSnapshot[];
}

const ITEM_REFERENCE_TYPES: ReadonlySet<unknown> = new Set<ItemReferenceType>([
    'EquipmentItem',
    'LootItem',
]);

const recommendedEntryOf = (value: unknown): RecommendedEntry | null => {
    if (!isRecord(value) || !ITEM_REFERENCE_TYPES.has(value.itemType)) {
        return null;
    }
    const itemId = refOf(value.item);
    if (!itemId || !isPositiveInteger(value.quantity)) return null;
    return {
        itemType: value.itemType as ItemReferenceType,
        itemId: itemId.toHexString(),
        quantity: value.quantity,
    };
};

const recommendedLootOf = (raw: unknown[] | null | undefined) =>
    (raw ?? [])
        .map(recommendedEntryOf)
        .filter((entry): entry is RecommendedEntry => entry !== null);

const ownedQuantityOf = (
    entries: readonly { item?: unknown; quantity?: unknown }[],
    itemId: string,
): number =>
    entries
        .filter((entry) => refOf(entry?.item)?.toHexString() === itemId)
        .reduce(
            (total, entry) =>
                total +
                (isPositiveInteger(entry.quantity) ? entry.quantity : 0),
            0,
        );

const wornCopiesOf = (
    snapshot: CombatCharacterSnapshot,
    itemId: string,
): number =>
    Object.values(SlotType).filter(
        (slot) =>
            refOf(snapshot.assets?.wearedEquipment?.[slot])?.toHexString() ===
            itemId,
    ).length;

const ownedLootItemsOf = (snapshot: CombatCharacterSnapshot) =>
    (snapshot.assets?.ownedItems ?? []).filter(
        (entry) => entry?.itemType === 'LootItem',
    );

// indossare non toglie l'oggetto da ownedEquipments: gli slot contano solo oltre il posseduto (dato curato a mano)
const possessedEquipmentOf = (
    snapshot: CombatCharacterSnapshot,
    itemId: string,
): number =>
    Math.max(
        ownedQuantityOf(snapshot.assets?.ownedEquipments ?? [], itemId),
        wornCopiesOf(snapshot, itemId),
    );

const possessedQuantityOf = (
    snapshot: CombatCharacterSnapshot,
    entry: RecommendedEntry,
): number =>
    entry.itemType === 'LootItem'
        ? ownedQuantityOf(ownedLootItemsOf(snapshot), entry.itemId)
        : possessedEquipmentOf(snapshot, entry.itemId);

const recommendedOwnedBy = (
    snapshot: CombatCharacterSnapshot,
    recommended: readonly RecommendedEntry[],
): RecommendedEntry[] =>
    recommended.flatMap((entry) => {
        const quantity = possessedQuantityOf(snapshot, entry);
        return quantity >= 1 ? [{ ...entry, quantity }] : [];
    });

// pura (D-11): i consigliati della quest e quelli posseduti da ogni partecipante, pronti per l'algoritmo di esplorazione dell'utente
export function buildDungeonContext(
    input: DungeonContextInput,
): DungeonContext {
    const recommendedLoot = recommendedLootOf(input.recommendedLoot);
    return {
        ...input.combat,
        recommendedLoot,
        recommendedOwned: Object.fromEntries(
            input.participants.map((snapshot) => [
                snapshot._id.toHexString(),
                recommendedOwnedBy(snapshot, recommendedLoot),
            ]),
        ),
    };
}
