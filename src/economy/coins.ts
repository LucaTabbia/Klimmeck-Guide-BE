export const COPPER_PER_SILVER = 100;
export const COPPER_PER_GOLD = 10_000;

export interface CoinPurse {
    gold: number;
    silver: number;
    copper: number;
}

type CoinsLike = Partial<CoinPurse> | null | undefined;

// rame totale come nel FE (Coins.toCopper): le denominazioni mancanti valgono 0
export function toCopper(coins: CoinsLike): number {
    return (
        (coins?.gold ?? 0) * COPPER_PER_GOLD +
        (coins?.silver ?? 0) * COPPER_PER_SILVER +
        (coins?.copper ?? 0)
    );
}

export function fromCopper(copper: number): CoinPurse {
    if (!Number.isSafeInteger(copper) || copper < 0) {
        throw new RangeError(`Importo in rame non valido: ${copper}`);
    }
    return {
        gold: Math.floor(copper / COPPER_PER_GOLD),
        silver: Math.floor((copper % COPPER_PER_GOLD) / COPPER_PER_SILVER),
        copper: copper % COPPER_PER_SILVER,
    };
}

export const normalize = (coins: CoinsLike): CoinPurse =>
    fromCopper(toCopper(coins));

export const add = (a: CoinsLike, b: CoinsLike): CoinPurse =>
    fromCopper(toCopper(a) + toCopper(b));

export const subtract = (a: CoinsLike, b: CoinsLike): CoinPurse =>
    fromCopper(toCopper(a) - toCopper(b));

export function compare(a: CoinsLike, b: CoinsLike): -1 | 0 | 1 {
    const difference = toCopper(a) - toCopper(b);
    if (difference === 0) return 0;
    return difference < 0 ? -1 : 1;
}
