import { Types } from 'mongoose';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    DROP_RATES,
    LootCandidate,
    RARITY_ORDER,
    rollLoot,
} from 'src/quests/outcomes/rewards/cascading-loot';
import { SequenceChance } from '../../../../test/quests/sequence-chance';

const LEGENDARY_ID = new Types.ObjectId('64b0000000000000000000a1');
const FIRST_COMMON_ID = new Types.ObjectId('64b0000000000000000000a2');
const SECOND_COMMON_ID = new Types.ObjectId('64b0000000000000000000a3');
const FIRST_RARE_ID = new Types.ObjectId('64b0000000000000000000a4');
const SECOND_RARE_ID = new Types.ObjectId('64b0000000000000000000a5');

const candidate = (
    item: Types.ObjectId,
    rarity: RarityType | null,
): LootCandidate => ({ itemType: 'LootItem', item, quantity: 1, rarity });

const legendary = candidate(LEGENDARY_ID, RarityType.legendary);
const firstCommon = candidate(FIRST_COMMON_ID, RarityType.common);
const secondCommon = candidate(SECOND_COMMON_ID, RarityType.common);

describe('cascading loot tables', () => {
    it('orders rarities from the highest down', () => {
        expect(RARITY_ORDER).toEqual([
            'legendary',
            'ultrarare',
            'rare',
            'uncommon',
            'common',
        ]);
    });

    it('declares the default drop rate of every rarity', () => {
        expect(DROP_RATES).toEqual({
            legendary: 0.02,
            ultrarare: 0.05,
            rare: 0.15,
            uncommon: 0.35,
            common: 0.6,
        });
    });
});

describe('rollLoot', () => {
    it('returns null without rolling when there is no candidate', () => {
        const chance = new SequenceChance();

        expect(rollLoot([], chance)).toBeNull();
        expect(chance.drawn).toEqual([]);
    });

    it('draws inside the winning rarity when it holds several items', () => {
        const chance = new SequenceChance([0.5, 0.99]);

        expect(rollLoot([firstCommon, secondCommon], chance)).toBe(
            secondCommon,
        );
    });

    it('returns the only item of the winning rarity without a draw', () => {
        const chance = new SequenceChance([0.01]);

        expect(rollLoot([legendary, firstCommon], chance)).toBe(legendary);
        expect(chance.drawn).toEqual([0.01]);
    });

    it('cascades to the next present rarity when the higher roll fails', () => {
        const chance = new SequenceChance([0.5, 0.3, 0.0]);

        expect(rollLoot([legendary, firstCommon, secondCommon], chance)).toBe(
            firstCommon,
        );
        expect(chance.drawn).toEqual([0.5, 0.3, 0.0]);
    });

    it('drops nothing when every present rarity fails, rolling only those', () => {
        const chance = new SequenceChance([0.9, 0.9]);

        expect(rollLoot([legendary, firstCommon], chance)).toBeNull();
        expect(chance.drawn).toHaveLength(2);
    });

    it('treats an item without rarity as common', () => {
        const unrated = candidate(FIRST_COMMON_ID, null);
        const chance = new SequenceChance([0.59]);

        expect(rollLoot([unrated], chance)).toBe(unrated);
    });

    it('rolls once for a rarity present alone and fails at its rate', () => {
        const chance = new SequenceChance([0.2]);
        const rares = [
            candidate(FIRST_RARE_ID, RarityType.rare),
            candidate(SECOND_RARE_ID, RarityType.rare),
        ];

        expect(rollLoot(rares, chance)).toBeNull();
        expect(chance.drawn).toHaveLength(1);
    });
});
