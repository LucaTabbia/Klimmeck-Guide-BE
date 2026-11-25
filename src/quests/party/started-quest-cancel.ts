// annullamento di una quest cominciata alla cancellazione di un account (Phase 26 D-13, D-26): regole pure, nessuna lettura dell'ora
import type { Types } from 'mongoose';
import {
    applyTradeToInventory,
    MAX_ITEM_QUANTITY,
    type InventoryEntry,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import { idForms, refIdOf, sameId } from 'src/mongo/document-id';

interface SpentLine {
    item: unknown;
    quantity: unknown;
}

// quest effettivamente cominciata con uno di questi personaggi registrato (Phase 26 D-26): posti pieni e tutti sul luogo
export function startedQuestsWithFilter(
    characterIds: readonly Types.ObjectId[],
): Record<string, unknown> {
    return {
        concludedAt: null,
        startedAt: { $ne: null },
        'registeredAdventurers.character': {
            $in: characterIds.flatMap((id) => idForms(id)),
        },
    };
}

// città di partenza = la città che contiene il marker della quest (Phase 26 D-26)
export function homeCityFilterOf(
    questMarker: Types.ObjectId,
): Record<string, unknown> {
    return { pointsOfInterest: { $in: idForms(questMarker) } };
}

const isRefundableQuantity = (quantity: unknown): quantity is number =>
    Number.isSafeInteger(quantity) && (quantity as number) > 0;

// righe del tragitto fuse per item; le malformate restano fuori
function mergedSpentOf(
    spent: readonly SpentLine[],
): { itemId: Types.ObjectId; quantity: number }[] {
    const merged: { itemId: Types.ObjectId; quantity: number }[] = [];
    for (const line of spent) {
        const itemId = refIdOf(line.item);
        if (!itemId || !isRefundableQuantity(line.quantity)) continue;
        const row = merged.find((entry) => entry.itemId.equals(itemId));
        if (row) row.quantity += line.quantity;
        else merged.push({ itemId, quantity: line.quantity });
    }
    return merged;
}

// il tetto di una riga della borsa limita il rimborso invece di farlo fallire: la cancellazione dell'account non si blocca mai su un rimborso
function refundLinesOf(
    ownedItems: readonly InventoryEntry[],
    spent: readonly SpentLine[],
): TradeLine[] {
    return mergedSpentOf(spent).flatMap(({ itemId, quantity }) => {
        const owned =
            ownedItems.find((entry) => sameId(entry.item, itemId))?.quantity ??
            0;
        const refundable = Math.min(quantity, MAX_ITEM_QUANTITY - owned);
        return refundable > 0
            ? [
                  {
                      direction: 'buy' as const,
                      kind: 'LootItem' as const,
                      itemId,
                      quantity: refundable,
                  },
              ]
            : [];
    });
}

// borsa dopo il rimborso del cibo del tragitto; null se nulla da restituire (Phase 26 D-13)
export function travelRefundOf(
    ownedItems: readonly InventoryEntry[] | undefined,
    spent: readonly SpentLine[] | undefined,
): InventoryEntry[] | null {
    const bag = [...(ownedItems ?? [])];
    const lines = refundLinesOf(bag, spent ?? []);
    if (lines.length === 0) return null;
    return applyTradeToInventory({ ownedItems: bag }, lines).ownedItems;
}

// vita dopo il rimborso della fame: mai oltre il massimo, mai sotto la vita attuale (Phase 26 D-13)
export function refundedLifeOf(
    current: number,
    lost: number,
    max: number,
): number {
    if (!Number.isFinite(lost) || lost <= 0) return current;
    return Math.max(current, Math.min(max, current + lost));
}
