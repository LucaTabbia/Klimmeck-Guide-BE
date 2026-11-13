import { Types } from 'mongoose';
import { CoinPurse, fromCopper, toCopper } from 'src/economy/coins';
import { isRecord } from '../combat/combat-context';
import type { RescueTurn } from '../dungeon/dungeon-turns';
import { isPositiveInteger } from '../outcome-numbers';
import { isNonNegativeInteger } from '../rewards/quest-rewards';

// premi: assorbe l'errore di rappresentazione delle quote non binarie (90 × 7/10 = 62.999…, 5 × (1/6)/(5/6) = 0.999…), mai un'unità intera;
// la durata non ne ha bisogno: si divide fra interi (sui millisecondi l'errore supera la tolleranza oltre qualche ora, IN-04)
const SHARE_EPSILON = 1e-9;

// la quota come frazione di interi: la stessa sorgente dà il numero dei premi e delle soglie e l'aritmetica intera della durata
export interface RescueShare {
    numerator: number;
    denominator: number;
}

const FULL_SHARE: RescueShare = { numerator: 1, denominator: 1 };

export interface AidPrizes {
    prizeCoins: unknown;
    xpPrize: unknown;
    prizeItem: unknown;
    randomLoot: unknown[];
    spell: unknown;
    pet: Types.ObjectId | null;
    rankPrizes?: unknown[];
}

// quota del soccorritore in turni completati sul totale della dungeon; senza turno il premio è intero (D-14, D-20)
export function rescueFractionOf(turn: RescueTurn | null): RescueShare {
    if (!turn) return FULL_SHARE;
    return { numerator: turn.index + 1, denominator: turn.total };
}

export const shareValueOf = ({ numerator, denominator }: RescueShare): number =>
    numerator / denominator;

export function rescueShareOf(turn: RescueTurn | null): number {
    return shareValueOf(rescueFractionOf(turn));
}

// una sorgente già scalata si riscala col rapporto delle due quote, sempre fra interi
export function shareRatioOf(
    share: RescueShare,
    source: RescueShare,
): RescueShare {
    return {
        numerator: share.numerator * source.denominator,
        denominator: share.denominator * source.numerator,
    };
}

const sharedAmountOf = (amount: number, share: number): number =>
    Math.floor(amount * share + SHARE_EPSILON);

// divisione intera per difetto, esatta sugli interi sicuri non negativi
const wholeQuotientOf = (dividend: number, divisor: number): number =>
    (dividend - (dividend % divisor)) / divisor;

// la durata dell'aid in proporzione, per difetto al millisecondo (quick 261113-aql); mai sotto 1 ms se l'originale dura (0 vorrebbe dire nessuna attesa)
export function sharedTimeOf(
    time: number | null,
    { numerator, denominator }: RescueShare,
): number | null {
    if (numerator >= denominator || !isPositiveInteger(time)) return time;
    return Math.max(1, wholeQuotientOf(time * numerator, denominator));
}

function sharedCoinsOf(coins: unknown, share: number): unknown {
    if (!isRecord(coins)) return coins;
    const copper = toCopper(coins as Partial<CoinPurse>);
    if (!isNonNegativeInteger(copper)) return coins;
    return fromCopper(sharedAmountOf(copper, share));
}

function sharedXpOf(xp: unknown, share: number): unknown {
    return isNonNegativeInteger(xp) ? sharedAmountOf(xp, share) : xp;
}

// un oggetto fisso che scende a zero sparisce (D-20)
function sharedItemOf(item: unknown, share: number): unknown {
    if (!isRecord(item) || !isNonNegativeInteger(item.quantity)) return item;
    const quantity = sharedAmountOf(item.quantity, share);
    if (quantity === 0) return null;
    return { itemType: item.itemType, item: item.item, quantity };
}

function sharedRankBlockOf(block: unknown, share: number): unknown {
    if (!isRecord(block)) return block;
    return {
        title: block.title,
        prizeCoins: sharedCoinsOf(block.prizeCoins, share),
        xpPrize: sharedXpOf(block.xpPrize, share),
        prizeItem: sharedItemOf(block.prizeItem, share),
        randomLoot: block.randomLoot,
        spell: block.spell,
        pet: block.pet,
        cure: block.cure,
    };
}

// monete, xp e quantità dell'oggetto fisso scritte in proporzione, per difetto; loot, pet e magia restano (le soglie le scala la risoluzione, D-20)
// costruiti campo per campo: i premi possono arrivare da un documento idratato
export function proportionalPrizesOf(
    prizes: AidPrizes,
    share: number,
): AidPrizes {
    if (share >= 1) return prizes;
    const shared: AidPrizes = {
        prizeCoins: sharedCoinsOf(prizes.prizeCoins, share),
        xpPrize: sharedXpOf(prizes.xpPrize, share),
        prizeItem: sharedItemOf(prizes.prizeItem, share),
        randomLoot: prizes.randomLoot,
        spell: prizes.spell,
        pet: prizes.pet,
    };
    if (!prizes.rankPrizes) return shared;
    return {
        ...shared,
        rankPrizes: prizes.rankPrizes.map((block) =>
            sharedRankBlockOf(block, share),
        ),
    };
}
