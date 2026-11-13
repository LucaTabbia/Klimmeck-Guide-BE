import { Types } from 'mongoose';
import { CoinPurse, fromCopper, toCopper } from 'src/economy/coins';
import { isRecord } from '../combat/combat-context';
import type { RescueTurn } from '../dungeon/dungeon-turns';
import { isNonNegativeInteger } from '../rewards/quest-rewards';

// assorbe l'errore di rappresentazione delle quote non binarie (90 × 7/10 = 62.999…, 5 × (1/6)/(5/6) = 0.999…), mai un'unità intera
const SHARE_EPSILON = 1e-9;

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
export function rescueShareOf(turn: RescueTurn | null): number {
    if (!turn) return 1;
    return (turn.index + 1) / turn.total;
}

const sharedAmountOf = (amount: number, share: number): number =>
    Math.floor(amount * share + SHARE_EPSILON);

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
