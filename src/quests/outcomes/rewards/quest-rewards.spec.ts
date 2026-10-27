import { Types } from 'mongoose';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    NO_REWARDS,
    PrizesSnapshot,
    RewardCatalog,
    canLearnSpell,
    drawRewards,
    rewardRefsOf,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { SequenceChance } from '../../../../test/quests/sequence-chance';

const POTION_ID = new Types.ObjectId('64b0000000000000000000b1');
const ORPHAN_ID = new Types.ObjectId('64b0000000000000000000b2');
const BONE_ID = new Types.ObjectId('64b0000000000000000000b3');
const SPELL_ID = new Types.ObjectId('64b0000000000000000000b4');
const ORPHAN_SPELL_ID = new Types.ObjectId('64b0000000000000000000b5');

const emptyCatalog: RewardCatalog = { rarities: new Map(), spells: new Map() };

const catalog: RewardCatalog = {
    rarities: new Map<string, RarityType | null>([
        [`LootItem:${POTION_ID.toHexString()}`, RarityType.uncommon],
        [`LootItem:${BONE_ID.toHexString()}`, RarityType.common],
    ]),
    spells: new Map([
        [SPELL_ID.toHexString(), { minXpToLearn: 4000, maxUsages: 4 }],
    ]),
};

const prizesWith = (overrides: PrizesSnapshot): PrizesSnapshot => ({
    prizeCoins: null,
    xpPrize: null,
    prizeItem: null,
    randomLoot: [],
    spell: null,
    ...overrides,
});

describe('drawRewards', () => {
    it('grants nothing when the quest has no prizes', () => {
        expect(drawRewards(null, emptyCatalog, new SequenceChance())).toEqual(
            NO_REWARDS,
        );
        expect(NO_REWARDS).toEqual({
            coinsCopper: 0,
            xpPrize: 0,
            items: [],
            spellCandidate: null,
        });
    });

    it('converts coins to copper and keeps a valid prize item', () => {
        const prizes = prizesWith({
            prizeCoins: { gold: 1, silver: 2, copper: 3 },
            xpPrize: 90,
            prizeItem: { itemType: 'LootItem', item: POTION_ID, quantity: 2 },
        });

        expect(drawRewards(prizes, catalog, new SequenceChance())).toEqual({
            coinsCopper: 10203,
            xpPrize: 90,
            items: [{ itemType: 'LootItem', item: POTION_ID, quantity: 2 }],
            spellCandidate: null,
        });
    });

    it.each([
        [
            'an orphan item',
            { itemType: 'LootItem', item: ORPHAN_ID, quantity: 1 },
        ],
        [
            'a zero quantity',
            { itemType: 'LootItem', item: POTION_ID, quantity: 0 },
        ],
        [
            'a fractional quantity',
            { itemType: 'LootItem', item: POTION_ID, quantity: 1.5 },
        ],
        [
            'an unknown item type',
            { itemType: 'Pet', item: POTION_ID, quantity: 1 },
        ],
    ])('discards a prize item with %s', (_label, prizeItem) => {
        const rewards = drawRewards(
            prizesWith({ prizeItem }),
            catalog,
            new SequenceChance(),
        );

        expect(rewards.items).toEqual([]);
    });

    it('rolls the loot only among catalogued entries, after the prize item', () => {
        const prizes = prizesWith({
            prizeItem: { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            randomLoot: [
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 1 },
                { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
            ],
        });

        const rewards = drawRewards(prizes, catalog, new SequenceChance([0.1]));

        expect(rewards.items).toEqual([
            { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
        ]);
    });

    it('keeps only the rolled common entry when the loot holds an orphan', () => {
        const prizes = prizesWith({
            randomLoot: [
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 1 },
                { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
            ],
        });

        const rewards = drawRewards(prizes, catalog, new SequenceChance([0.1]));

        expect(rewards.items).toEqual([
            { itemType: 'LootItem', item: BONE_ID, quantity: 3 },
        ]);
    });

    it.each([[-5], ['90'], [null]])(
        'grants no experience for a malformed xpPrize %p',
        (xpPrize) => {
            const rewards = drawRewards(
                prizesWith({ xpPrize }),
                catalog,
                new SequenceChance(),
            );

            expect(rewards.xpPrize).toBe(0);
        },
    );

    it('offers the catalogued spell as a candidate', () => {
        const rewards = drawRewards(
            prizesWith({ spell: SPELL_ID }),
            catalog,
            new SequenceChance(),
        );

        expect(rewards.spellCandidate).toEqual({
            spellId: SPELL_ID,
            minXpToLearn: 4000,
            maxUsages: 4,
        });
    });

    it('drops an orphan spell', () => {
        const rewards = drawRewards(
            prizesWith({ spell: ORPHAN_SPELL_ID }),
            catalog,
            new SequenceChance(),
        );

        expect(rewards.spellCandidate).toBeNull();
    });
});

describe('canLearnSpell', () => {
    const candidate = { spellId: SPELL_ID, minXpToLearn: 4000, maxUsages: 4 };

    it('teaches the spell once the experience reaches the threshold', () => {
        expect(canLearnSpell(candidate, 4000, [])).toBe(SPELL_ID);
    });

    it('does not teach it below the threshold', () => {
        expect(canLearnSpell(candidate, 3999, [])).toBeNull();
    });

    it('does not teach a spell already known, even as a legacy string', () => {
        expect(
            canLearnSpell(candidate, 50000, [SPELL_ID.toHexString()]),
        ).toBeNull();
    });

    it('teaches nothing without a candidate', () => {
        expect(canLearnSpell(null, 50000, [])).toBeNull();
    });
});

describe('rewardRefsOf', () => {
    it('lists the formally valid item refs and the spell for the catalog reads', () => {
        const prizes = prizesWith({
            prizeItem: {
                itemType: 'EquipmentItem',
                item: POTION_ID,
                quantity: 1,
            },
            randomLoot: [
                {
                    itemType: 'LootItem',
                    item: BONE_ID.toHexString(),
                    quantity: 2,
                },
                { itemType: 'Pet', item: ORPHAN_ID, quantity: 1 },
                { itemType: 'LootItem', item: ORPHAN_ID, quantity: 0 },
            ],
            spell: SPELL_ID,
        });

        expect(rewardRefsOf(prizes)).toEqual({
            items: [
                { itemType: 'EquipmentItem', item: POTION_ID },
                { itemType: 'LootItem', item: BONE_ID },
            ],
            spellId: SPELL_ID,
        });
    });

    it('returns no refs without prizes', () => {
        expect(rewardRefsOf(null)).toEqual({ items: [], spellId: null });
    });
});
