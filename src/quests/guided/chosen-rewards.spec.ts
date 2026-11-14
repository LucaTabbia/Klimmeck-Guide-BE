import { Types } from 'mongoose';
import { toCopper } from 'src/economy/coins';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    NO_REWARDS,
    RewardCatalog,
} from 'src/quests/outcomes/rewards/quest-rewards';
import { chosenRewardsOf } from 'src/quests/guided/chosen-rewards';
import { MissionPrizeRecord } from 'src/quests/guided/mission-draft.model';

const CHARACTER_ID = new Types.ObjectId('64f2000000000000000000a1');
const SWORD_ID = new Types.ObjectId('64f2000000000000000000b1');
const POTION_ID = new Types.ObjectId('64f2000000000000000000b2');
const PET_ID = new Types.ObjectId('64f2000000000000000000c1');
const SPELL_ID = new Types.ObjectId('64f2000000000000000000d1');
const LORE_ID = new Types.ObjectId('64f2000000000000000000e1');
const MISSING_ID = new Types.ObjectId('64f2000000000000000000f1');

const catalog: RewardCatalog = {
    rarities: new Map<string, RarityType | null>([
        [`EquipmentItem:${SWORD_ID.toHexString()}`, RarityType.rare],
        [`LootItem:${POTION_ID.toHexString()}`, RarityType.common],
    ]),
    spells: new Map([
        [SPELL_ID.toHexString(), { minXpToLearn: 300, maxUsages: 4 }],
    ]),
    spellPool: [],
    pets: new Map([[PET_ID.toHexString(), 45]]),
    petLore: new Map([[PET_ID.toHexString(), [LORE_ID]]]),
};

const cure = { lifePointsShare: 0.5, canHeal: [InjuryType.crushedRightHand] };

const chosenPrize = (
    overrides: Partial<MissionPrizeRecord> = {},
): MissionPrizeRecord => ({
    character: CHARACTER_ID,
    coins: { gold: 1, silver: 0, copper: 5 },
    xp: 400,
    items: [
        { itemType: 'EquipmentItem', item: SWORD_ID, quantity: 1 },
        { itemType: 'LootItem', item: POTION_ID, quantity: 3 },
    ],
    pet: PET_ID,
    spell: SPELL_ID,
    cure,
    ...overrides,
});

describe('chosenRewardsOf', () => {
    it('turns a chosen prize into rewards without draws (D-07, D-08, D-15)', () => {
        expect(chosenRewardsOf(chosenPrize(), catalog)).toEqual({
            coinsCopper: toCopper({ gold: 1, silver: 0, copper: 5 }),
            xpPrize: 400,
            items: [
                { itemType: 'EquipmentItem', item: SWORD_ID, quantity: 1 },
                { itemType: 'LootItem', item: POTION_ID, quantity: 3 },
            ],
            spellCandidate: {
                spellId: SPELL_ID,
                minXpToLearn: 300,
                maxUsages: 4,
            },
            spellDraw: null,
            pet: PET_ID,
            petLifePoints: 45,
            petLore: [LORE_ID],
            loreDraw: null,
            cure,
        });
    });

    it('drops a pet or spell missing from the catalogue (D-07)', () => {
        const rewards = chosenRewardsOf(
            chosenPrize({ pet: MISSING_ID, spell: MISSING_ID, cure: null }),
            catalog,
        );

        expect(rewards.pet).toBeNull();
        expect(rewards.petLifePoints).toBeNull();
        expect(rewards.petLore).toEqual([]);
        expect(rewards.spellCandidate).toBeNull();
        expect(rewards.cure).toBeNull();
    });

    it('answers no rewards without a prize (D-08)', () => {
        expect(chosenRewardsOf(null, catalog)).toBe(NO_REWARDS);
    });
});
