import type { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
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
}

export interface InventoryOutcome {
    ownedItems: InventoryEntry[];
    ownedEquipments: InventoryEntry[];
}

// le voci legacy possono avere l'id salvato come stringa (04 Pitfall 1)
function sameId(value: unknown, id: Types.ObjectId): boolean {
    return (
        value != null &&
        (value as { toString(): string }).toString() === id.toHexString()
    );
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

function buy(entries: InventoryEntry[], index: number, line: TradeLine) {
    if (index === -1) {
        entries.push({
            itemType: line.kind,
            item: line.itemId,
            quantity: line.quantity,
        });
        return;
    }
    entries[index].quantity += line.quantity;
}

// stato finale calcolato prima della scrittura (04 D-07); le voci a zero spariscono, gli acquisti incrementano o si aggiungono (D-08)
export function applyTradeToInventory(
    snapshot: InventorySnapshot,
    lines: readonly TradeLine[],
): InventoryOutcome {
    const outcome: InventoryOutcome = {
        ownedItems: copyEntries(snapshot.ownedItems),
        ownedEquipments: copyEntries(snapshot.ownedEquipments),
    };
    for (const line of lines) {
        const entries = outcome[INVENTORY_FIELD[line.kind]];
        const index = entries.findIndex((entry) =>
            sameId(entry.item, line.itemId),
        );
        if (line.direction === 'sell') sell(entries, index, line);
        else buy(entries, index, line);
    }
    return outcome;
}

// le quantità vendute riaffermate nel filtro della scrittura in sessione (04 D-07): uno snapshot superato non scrive
export function soldQuantityGuards(
    lines: readonly TradeLine[],
): Record<string, unknown> {
    const guards = lines
        .filter((line) => line.direction === 'sell')
        .map((line) => ({
            [`assets.${INVENTORY_FIELD[line.kind]}`]: {
                $elemMatch: {
                    item: line.itemId,
                    quantity: { $gte: line.quantity },
                },
            },
        }));
    return guards.length === 0 ? {} : { $and: guards };
}
