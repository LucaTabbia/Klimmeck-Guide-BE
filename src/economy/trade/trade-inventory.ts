import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { SlotType } from 'src/models/enums/slot_type.enum';
import { idForms, sameId } from 'src/mongo/document-id';
import {
    INVENTORY_FIELD,
    type TradeItemKind,
    type TradeLine,
} from './trade-line';

export interface InventoryEntry {
    itemType: TradeItemKind;
    item: unknown;
    quantity: number;
}

export interface InventorySnapshot {
    ownedItems?: InventoryEntry[];
    ownedEquipments?: InventoryEntry[];
    wearedEquipment?: Partial<Record<SlotType, unknown>> | null;
}

export interface InventoryOutcome {
    ownedItems: InventoryEntry[];
    ownedEquipments: InventoryEntry[];
    vacatedSlots: SlotType[];
}

const copyEntries = (entries: InventoryEntry[] | undefined) =>
    (entries ?? []).map((entry) => ({ ...entry }));

function sell(entries: InventoryEntry[], index: number, line: TradeLine) {
    if (index === -1) throw GameRuleException.itemNotOwned();
    const entry = entries[index];
    if (entry.quantity < line.quantity) {
        throw GameRuleException.insufficientItemQuantity();
    }
    entry.quantity -= line.quantity;
    if (entry.quantity === 0) entries.splice(index, 1);
}

// AssetQuantity.quantity è un Int GraphQL: oltre questo limite il personaggio non si serializza più
export const MAX_ITEM_QUANTITY = 2_147_483_647;

function buy(entries: InventoryEntry[], index: number, line: TradeLine) {
    const quantity =
        (index === -1 ? 0 : entries[index].quantity) + line.quantity;
    if (quantity > MAX_ITEM_QUANTITY) throw GameRuleException.invalidQuantity();
    if (index === -1) {
        entries.push({ itemType: line.kind, item: line.itemId, quantity });
        return;
    }
    entries[index].quantity = quantity;
}

function applyLines(
    snapshot: InventorySnapshot,
    lines: readonly TradeLine[],
): Omit<InventoryOutcome, 'vacatedSlots'> {
    const inventory = {
        ownedItems: copyEntries(snapshot.ownedItems),
        ownedEquipments: copyEntries(snapshot.ownedEquipments),
    };
    for (const line of lines) {
        const entries = inventory[INVENTORY_FIELD[line.kind]];
        const index = entries.findIndex((entry) =>
            sameId(entry.item, line.itemId),
        );
        if (line.direction === 'sell') sell(entries, index, line);
        else buy(entries, index, line);
    }
    return inventory;
}

// equipaggiato implica posseduto (04 D-12): uno slot che indossa un equipaggiamento venduto fino a zero si svuota
function slotsWearingSoldOut(
    snapshot: InventorySnapshot,
    lines: readonly TradeLine[],
    ownedEquipments: readonly InventoryEntry[],
): SlotType[] {
    const soldOut = lines
        .filter(
            (line) =>
                line.direction === 'sell' && line.kind === 'EquipmentItem',
        )
        .map((line) => line.itemId)
        .filter(
            (itemId) =>
                !ownedEquipments.some((entry) => sameId(entry.item, itemId)),
        );
    return Object.values(SlotType).filter((slot) =>
        soldOut.some((itemId) =>
            sameId(snapshot.wearedEquipment?.[slot], itemId),
        ),
    );
}

// stato finale calcolato prima della scrittura (04 D-07); le voci a zero spariscono, gli acquisti incrementano o si aggiungono (D-08)
export function applyTradeToInventory(
    snapshot: InventorySnapshot,
    lines: readonly TradeLine[],
): InventoryOutcome {
    const inventory = applyLines(snapshot, lines);
    return {
        ...inventory,
        vacatedSlots: slotsWearingSoldOut(
            snapshot,
            lines,
            inventory.ownedEquipments,
        ),
    };
}

// le quantità vendute riaffermate nel filtro della scrittura in sessione (04 D-07): rete di sicurezza, la contesa la risolve il WriteConflict della transazione
export function soldQuantityGuards(
    lines: readonly TradeLine[],
): Record<string, unknown> {
    const guards = lines
        .filter((line) => line.direction === 'sell')
        .map((line) => ({
            [`assets.${INVENTORY_FIELD[line.kind]}`]: {
                $elemMatch: {
                    item: { $in: idForms(line.itemId) },
                    quantity: { $gte: line.quantity },
                },
            },
        }));
    return guards.length === 0 ? {} : { $and: guards };
}
