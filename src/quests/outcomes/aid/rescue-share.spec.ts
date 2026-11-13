import { Types } from 'mongoose';
import { fromCopper, toCopper } from 'src/economy/coins';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    AidPrizes,
    proportionalPrizesOf,
    rescueShareOf,
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
