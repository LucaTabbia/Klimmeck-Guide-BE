import { Types } from 'mongoose';
import { fromCopper, toCopper } from 'src/economy/coins';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    AidPrizes,
    proportionalPrizesOf,
    rescueFractionOf,
    rescueShareOf,
    shareRatioOf,
    sharedTimeOf,
} from 'src/quests/outcomes/aid/rescue-share';

const LOOT_ID = new Types.ObjectId('64b0000000000000000000e1');
const BONE_ID = new Types.ObjectId('64b0000000000000000000e2');
const SPELL_ID = new Types.ObjectId('64b0000000000000000000e3');
const PET_ID = new Types.ObjectId('64b0000000000000000000e4');

const PRIZE_COINS = { gold: 1, silver: 3, copper: 7 };

const prizesWith = (overrides: Partial<AidPrizes> = {}): AidPrizes => ({
    prizeCoins: PRIZE_COINS,
    xpPrize: 101,
    prizeItem: { itemType: 'LootItem', item: LOOT_ID, quantity: 3 },
    randomLoot: [{ itemType: 'LootItem', item: BONE_ID, quantity: 1 }],
    spell: SPELL_ID,
    pet: PET_ID,
    ...overrides,
});

describe('rescueShareOf', () => {
    it.each([
        [{ index: 4, kind: DungeonTurnKind.exploration, total: 8 }, 0.625],
        [{ index: 3, kind: DungeonTurnKind.fight, total: 8 }, 0.5],
        [{ index: 7, kind: DungeonTurnKind.fight, total: 8 }, 1],
        [null, 1],
    ])(
        'shares the prize by the completed turns (D-14, D-20): %o → %d',
        (turn, share) => {
            expect(rescueShareOf(turn)).toBe(share);
        },
    );
});

// una sola quota: la frazione intera da cui escono sia il numero dei premi sia l'aritmetica intera della durata (IN-04)
describe('rescueFractionOf', () => {
    it('reads the completed turns over the total as whole numbers (quick 261113-aql, IN-04)', () => {
        expect(
            rescueFractionOf({
                index: 6,
                kind: DungeonTurnKind.exploration,
                total: 10,
            }),
        ).toEqual({ numerator: 7, denominator: 10 });
    });

    it('is the full share without a turn (quick 261113-aql, IN-04)', () => {
        expect(rescueFractionOf(null)).toEqual({
            numerator: 1,
            denominator: 1,
        });
    });

    it('rescales a share by the share of its source as whole numbers (quick 261113-aql, IN-04)', () => {
        expect(
            shareRatioOf(
                { numerator: 3, denominator: 10 },
                { numerator: 4, denominator: 10 },
            ),
        ).toEqual({ numerator: 30, denominator: 40 });
    });
});

describe('proportionalPrizesOf', () => {
    it('writes the share of coins, xp and fixed item rounded down (D-20)', () => {
        const prizes = prizesWith();

        const shared = proportionalPrizesOf(prizes, 0.5);

        expect(shared).toEqual({
            prizeCoins: fromCopper(Math.floor(toCopper(PRIZE_COINS) * 0.5)),
            xpPrize: 50,
            prizeItem: { itemType: 'LootItem', item: LOOT_ID, quantity: 1 },
            randomLoot: prizes.randomLoot,
            spell: SPELL_ID,
            pet: PET_ID,
        });
        expect(shared.prizeCoins).toEqual({ gold: 0, silver: 51, copper: 53 });
    });

    it('drops a fixed item that falls to zero (D-20)', () => {
        const shared = proportionalPrizesOf(
            prizesWith({
                prizeItem: { itemType: 'LootItem', item: LOOT_ID, quantity: 1 },
            }),
            0.625,
        );

        expect(shared.prizeItem).toBeNull();
    });

    it('keeps every prize with a full share (D-14)', () => {
        const prizes = prizesWith();

        expect(proportionalPrizesOf(prizes, 1)).toEqual(prizes);
    });

    it('keeps missing or malformed prizes as they are (D-20)', () => {
        const bare = prizesWith({
            prizeCoins: null,
            xpPrize: 'many',
            prizeItem: null,
        });

        expect(proportionalPrizesOf(bare, 0.5)).toEqual(bare);
    });

    // 90 × 7/10 vale 62.999… in virgola mobile: senza l'assorbimento uscirebbe 62
    it('writes a non binary share exactly, never a unit less (C-IN-01, D-20)', () => {
        const share = rescueShareOf({
            index: 6,
            kind: DungeonTurnKind.exploration,
            total: 10,
        });

        const shared = proportionalPrizesOf(
            prizesWith({
                prizeCoins: { gold: 0, silver: 0, copper: 90 },
                xpPrize: 90,
                prizeItem: {
                    itemType: 'LootItem',
                    item: LOOT_ID,
                    quantity: 90,
                },
            }),
            share,
        );

        expect(shared.xpPrize).toBe(63);
        expect(shared.prizeCoins).toEqual({ gold: 0, silver: 0, copper: 63 });
        expect(shared.prizeItem).toEqual({
            itemType: 'LootItem',
            item: LOOT_ID,
            quantity: 63,
        });
    });

    // 89 × 7/10 = 62.3 e 5 × 1/5 = 1 esatto: l'assorbimento non aggiunge mai un'unità
    it('never rounds a share up beyond the exact amount (C-IN-01, D-20)', () => {
        expect(
            proportionalPrizesOf(prizesWith({ xpPrize: 89 }), 0.7).xpPrize,
        ).toBe(62);
        expect(
            proportionalPrizesOf(prizesWith({ xpPrize: 5 }), 0.2).xpPrize,
        ).toBe(1);
        expect(
            proportionalPrizesOf(prizesWith({ xpPrize: 4 }), 0.2).xpPrize,
        ).toBe(0);
    });

    it('shares every rank block the same way (D-20)', () => {
        const block = {
            title: TitleType.mage,
            prizeCoins: { gold: 0, silver: 0, copper: 9 },
            xpPrize: 9,
            prizeItem: { itemType: 'LootItem', item: LOOT_ID, quantity: 2 },
            randomLoot: [],
            spell: null,
            pet: PET_ID,
            cure: null,
        };

        const shared = proportionalPrizesOf(
            prizesWith({ rankPrizes: [block] }),
            0.5,
        );

        expect(shared.rankPrizes).toEqual([
            {
                ...block,
                prizeCoins: { gold: 0, silver: 0, copper: 4 },
                xpPrize: 4,
                prizeItem: { itemType: 'LootItem', item: LOOT_ID, quantity: 1 },
            },
        ]);
    });
});

// utente 2026-11-13: «1 ora dungeon completo -> 15 minuti aid»
describe('sharedTimeOf', () => {
    const share = (numerator: number, denominator: number) => ({
        numerator,
        denominator,
    });

    it.each([
        [3_600_000, share(1, 4), 900_000],
        [3_600_000, share(2, 8), 900_000],
        [3_600_000, share(5, 8), 2_250_000],
        [3_600_000, share(1, 1), 3_600_000],
        [1_000_001, share(1, 2), 500_000],
    ])(
        'writes the share of the aid time rounded down to the millisecond (quick 261113-aql): %d × %o → %d',
        (time, fraction, shared) => {
            expect(sharedTimeOf(time, fraction)).toBe(shared);
        },
    );

    // 86 400 000 × 0.7 vale 60 479 999.99… in virgola mobile: la durata si divide fra interi, senza tolleranza
    it.each([
        [86_400_000, share(7, 10), 60_480_000],
        [34_560_000, share(30, 40), 25_920_000],
    ])(
        'never loses a millisecond on a long time (quick 261113-aql, IN-04): %d × %o → %d',
        (time, fraction, shared) => {
            expect(sharedTimeOf(time, fraction)).toBe(shared);
        },
    );

    it('never brings a positive time below one millisecond (quick 261113-aql)', () => {
        expect(sharedTimeOf(3, share(1, 8))).toBe(1);
    });

    it('keeps a missing, zero or malformed time as it is (quick 261113-aql)', () => {
        expect(sharedTimeOf(null, share(1, 4))).toBeNull();
        expect(sharedTimeOf(0, share(1, 4))).toBe(0);
        expect(sharedTimeOf(-5, share(1, 4))).toBe(-5);
    });
});
