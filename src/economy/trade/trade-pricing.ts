import { GameRuleException } from 'src/gameRules/game-rule.exception';
import type { AssetQuantityInput } from 'src/models/common/asset-quantity.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { toCopper } from '../coins';
import {
    priceKey,
    type CatalogPrices,
    type TradeDirection,
    type TradeItemKind,
    type TradeLine,
} from './trade-line';

export interface TradePrice {
    totalBuyCopper: number;
    totalSellCopper: number;
    netCopper: number;
}

type TradeSource = readonly [
    TradeDirection,
    TradeItemKind,
    readonly AssetQuantityInput[],
];

function tradeSources(request: TransactionRequest): TradeSource[] {
    return [
        ['buy', 'EquipmentItem', request.boughtItems.equipAssets],
        ['buy', 'LootItem', request.boughtItems.lootAssets],
        ['sell', 'EquipmentItem', request.soldItems.equipAssets],
        ['sell', 'LootItem', request.soldItems.lootAssets],
    ];
}

function toTradeLine(
    direction: TradeDirection,
    kind: TradeItemKind,
    asset: AssetQuantityInput,
): TradeLine {
    const itemId = objectIdFromHex(asset.item);
    if (itemId === null) throw GameRuleException.itemNotFound();
    if (!Number.isSafeInteger(asset.quantity) || asset.quantity <= 0) {
        throw GameRuleException.invalidQuantity();
    }
    return { direction, kind, itemId, quantity: asset.quantity };
}

// una chiave kind:id per scambio, su entrambi i versi: duplicati e compra-vendi dello stesso oggetto aggirerebbero i controlli (04 D-06)
export function planTradeLines(request: TransactionRequest): TradeLine[] {
    const seen = new Set<string>();
    return tradeSources(request).flatMap(([direction, kind, assets]) =>
        assets.map((asset) => {
            const line = toTradeLine(direction, kind, asset);
            const key = priceKey(kind, line.itemId);
            if (seen.has(key)) throw GameRuleException.invalidQuantity();
            seen.add(key);
            return line;
        }),
    );
}

function lineCopper(line: TradeLine, prices: CatalogPrices): number {
    const price = prices.get(priceKey(line.kind, line.itemId));
    if (price === undefined) throw GameRuleException.itemNotFound();
    const unit = line.direction === 'buy' ? price.buyPrice : price.sellPrice;
    if (unit == null) throw GameRuleException.itemNotTradable();
    return toCopper(unit) * line.quantity;
}

// il prezzo viene solo dal catalogo del BE (04 D-06)
export function priceTrade(
    lines: readonly TradeLine[],
    prices: CatalogPrices,
): TradePrice {
    let totalBuyCopper = 0;
    let totalSellCopper = 0;
    for (const line of lines) {
        const copper = lineCopper(line, prices);
        if (line.direction === 'buy') totalBuyCopper += copper;
        else totalSellCopper += copper;
    }
    const netCopper = totalSellCopper - totalBuyCopper;
    const safe = [totalBuyCopper, totalSellCopper, netCopper].every((value) =>
        Number.isSafeInteger(value),
    );
    if (!safe) throw GameRuleException.invalidQuantity();
    return { totalBuyCopper, totalSellCopper, netCopper };
}

// il BE è l'autorità del prezzo (04 D-06): il totale del client è solo un controllo, regola FE transaction_modal.dart
export function assertClientTotalMatches(
    request: Pick<TransactionRequest, 'total' | 'isTotalPositive'>,
    netCopper: number,
): void {
    const { gold, silver, copper } = request.total;
    const wellFormed = [gold, silver, copper].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
    );
    if (!wellFormed) throw GameRuleException.transactionTotalMismatch();
    const amount = toCopper(request.total);
    const clientNet =
        amount === 0 ? 0 : request.isTotalPositive ? amount : -amount;
    if (clientNet !== netCopper) {
        throw GameRuleException.transactionTotalMismatch();
    }
}
