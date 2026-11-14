import { Types } from 'mongoose';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { RewardCatalog } from 'src/quests/outcomes/rewards/quest-rewards';
import {
    MAX_PRIZE_ITEM_QUANTITY,
    prefilledPrizeOf,
} from 'src/quests/guided/mission-draft-prefill';

const CHARACTER_ID = new Types.ObjectId('64c0000000000000000000a1');
const POTION_ID = new Types.ObjectId('64c0000000000000000000b1');
const BONE_ID = new Types.ObjectId('64c0000000000000000000b2');
const HERB_ID = new Types.ObjectId('64c0000000000000000000b3');
const SWORD_ID = new Types.ObjectId('64c0000000000000000000b4');
const ORPHAN_ID = new Types.ObjectId('64c0000000000000000000b5');
const SPELL_ID = new Types.ObjectId('64c0000000000000000000c1');
const PET_ID = new Types.ObjectId('64c0000000000000000000d1');

type PrefillCatalog = Pick<RewardCatalog, 'rarities' | 'spells' | 'pets'>;

const catalog: PrefillCatalog = {
    rarities: new Map<string, RarityType | null>([
        [`LootItem:${POTION_ID.toHexString()}`, RarityType.common],
        [`LootItem:${BONE_ID.toHexString()}`, RarityType.common],
        [`LootItem:${HERB_ID.toHexString()}`, RarityType.uncommon],
        [`EquipmentItem:${SWORD_ID.toHexString()}`, RarityType.rare],
    ]),
    spells: new Map([
        [SPELL_ID.toHexString(), { minXpToLearn: 100, maxUsages: 3 }],
    ]),
    pets: new Map([[PET_ID.toHexString(), 30]]),
};

const emptyCatalog: PrefillCatalog = {
    rarities: new Map(),
    spells: new Map(),
    pets: new Map(),
};

const loot = (item: Types.ObjectId, quantity = 1) => ({
    itemType: 'LootItem',
    item,
    quantity,
});

describe('prefilledPrizeOf', () => {
    it('prefills the whole rank block of the participant (D-22)', () => {
        const prize = prefilledPrizeOf({
            characterId: CHARACTER_ID,
            block: {
                prizeCoins: { gold: 1, silver: 2, copper: 3 },
                xpPrize: 120,
                prizeItem: loot(POTION_ID),
                randomLoot: [
                    loot(BONE_ID, 2),
                    loot(HERB_ID),
                    { itemType: 'EquipmentItem', item: SWORD_ID, quantity: 1 },
                ],
                pet: PET_ID,
                spell: SPELL_ID,
                cure: {
                    lifePointsShare: 0.5,
                    canHeal: [InjuryType.crushedRightHand],
                },
            },
            catalog,
        });

        expect(prize).toEqual({
            character: CHARACTER_ID,
            coins: { gold: 1, silver: 2, copper: 3 },
            xp: 120,
            items: [
                { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
                { itemType: 'LootItem', item: BONE_ID, quantity: 2 },
                { itemType: 'LootItem', item: HERB_ID, quantity: 1 },
                { itemType: 'EquipmentItem', item: SWORD_ID, quantity: 1 },
            ],
            pet: PET_ID,
            spell: SPELL_ID,
            cure: {
                lifePointsShare: 0.5,
                canHeal: [InjuryType.crushedRightHand],
            },
        });
    });

    it('drops orphan entries of the block (D-22)', () => {
        const prize = prefilledPrizeOf({
            characterId: CHARACTER_ID,
            block: {
                prizeItem: loot(POTION_ID),
                randomLoot: [loot(ORPHAN_ID)],
                pet: new Types.ObjectId(),
                spell: new Types.ObjectId(),
            },
            catalog,
        });

        expect(prize.items).toEqual([
            { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
        ]);
        expect(prize.pet).toBeNull();
        expect(prize.spell).toBeNull();
    });

    it('merges the same item and caps its quantity at 99 (D-15)', () => {
        const prize = prefilledPrizeOf({
            characterId: CHARACTER_ID,
            block: {
                prizeItem: loot(POTION_ID, 60),
                randomLoot: [loot(POTION_ID, 70)],
            },
            catalog,
        });

        expect(MAX_PRIZE_ITEM_QUANTITY).toBe(99);
        expect(prize.items).toEqual([
            { itemType: 'LootItem', item: POTION_ID, quantity: 99 },
        ]);
    });

    it('answers an empty prize without a block (D-22)', () => {
        expect(
            prefilledPrizeOf({
                characterId: CHARACTER_ID,
                block: null,
                catalog: emptyCatalog,
            }),
        ).toEqual({
            character: CHARACTER_ID,
            coins: { gold: 0, silver: 0, copper: 0 },
            xp: 0,
            items: [],
            pet: null,
            spell: null,
            cure: null,
        });
    });

    it('reads malformed coins and xp as zero (D-15)', () => {
        const prize = prefilledPrizeOf({
            characterId: CHARACTER_ID,
            block: { prizeCoins: { gold: -1 }, xpPrize: 'x' },
            catalog,
        });

        expect(prize.coins).toEqual({ gold: 0, silver: 0, copper: 0 });
        expect(prize.xp).toBe(0);
        expect(prize.cure).toBeNull();
    });
});
