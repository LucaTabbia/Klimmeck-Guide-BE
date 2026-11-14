import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { PrizesSnapshot } from 'src/quests/outcomes/rewards/quest-rewards';
import {
    assertPrizeAllowed,
    ceilingTableOf,
    MissionPrizeAllowance,
    MissionPrizeCatalogue,
    missionPrizeOptionsOf,
} from 'src/quests/guided/mission-prizes';

const EQUIP = {
    common: '64f1000000000000000000a1',
    uncommon: '64f1000000000000000000a2',
    rare: '64f1000000000000000000a3',
    ultrarare: '64f1000000000000000000a4',
    legendary: '64f1000000000000000000a5',
    none: '64f1000000000000000000a6',
    unknown: '64f1000000000000000000a7',
};
const LOOT = {
    common: '64f1000000000000000000b1',
    uncommon: '64f1000000000000000000b2',
    rare: '64f1000000000000000000b3',
    ultrarare: '64f1000000000000000000b4',
    legendary: '64f1000000000000000000b5',
    none: '64f1000000000000000000b6',
    unknown: '64f1000000000000000000b7',
};
const PET = {
    common: '64f1000000000000000000c1',
    uncommon: '64f1000000000000000000c2',
    rare: '64f1000000000000000000c3',
    ultrarare: '64f1000000000000000000c4',
    legendary: '64f1000000000000000000c5',
    none: '64f1000000000000000000c6',
};
const SPELL = {
    cheap: '64f1000000000000000000d1',
    exact: '64f1000000000000000000d2',
    costly: '64f1000000000000000000d3',
    known: '64f1000000000000000000d4',
    malformed: '64f1000000000000000000d5',
    block: '64f1000000000000000000d6',
};

const catalogue: MissionPrizeCatalogue = {
    equipment: [
        { id: EQUIP.legendary, rarity: RarityType.legendary },
        { id: EQUIP.common, rarity: RarityType.common },
        { id: EQUIP.uncommon, rarity: RarityType.uncommon },
        { id: EQUIP.rare, rarity: RarityType.rare },
        { id: EQUIP.ultrarare, rarity: RarityType.ultrarare },
        { id: EQUIP.none, rarity: null },
        { id: EQUIP.unknown, rarity: 'mythic' },
    ],
    loot: [
        { id: LOOT.common, rarity: RarityType.common },
        { id: LOOT.uncommon, rarity: RarityType.uncommon },
        { id: LOOT.rare, rarity: RarityType.rare },
        { id: LOOT.ultrarare, rarity: RarityType.ultrarare },
        { id: LOOT.legendary, rarity: RarityType.legendary },
        { id: LOOT.none, rarity: null },
        { id: LOOT.unknown, rarity: 'mythic' },
    ],
    pets: [
        { id: PET.common, rarity: RarityType.common },
        { id: PET.uncommon, rarity: RarityType.uncommon },
        { id: PET.rare, rarity: RarityType.rare },
        { id: PET.ultrarare, rarity: RarityType.ultrarare },
        { id: PET.legendary, rarity: RarityType.legendary },
        { id: PET.none, rarity: null },
    ],
    spells: [
        { id: SPELL.costly, minXpToLearn: 500 },
        { id: SPELL.cheap, minXpToLearn: 100 },
        { id: SPELL.exact, minXpToLearn: 300 },
        { id: SPELL.known, minXpToLearn: 50 },
        { id: SPELL.malformed, minXpToLearn: '100' },
    ],
};

interface OptionsCase {
    block?: PrizesSnapshot | null;
    questType?: QuestType;
    title?: TitleType;
    xp?: number;
    knownSpellIds?: readonly string[];
}

const optionsOf = ({
    block = null,
    questType = QuestType.worldMission,
    title = TitleType.mage,
    xp = 300,
    knownSpellIds = [],
}: OptionsCase = {}): MissionPrizeAllowance =>
    missionPrizeOptionsOf({
        block,
        questType,
        title,
        xp,
        knownSpellIds,
        catalogue,
    });

function codeOf(run: () => unknown): GameRuleErrorCode | undefined {
    try {
        run();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

describe('mission prize options', () => {
    it('caps the rarity with the boss table for a world mission and the enemy table for a story (D-22)', () => {
        expect(ceilingTableOf(QuestType.worldMission)).toBe(QuestType.boss);
        expect(ceilingTableOf(QuestType.story)).toBe(QuestType.enemy);
        expect(optionsOf().maxRarity).toBe(RarityType.ultrarare);
        expect(optionsOf({ questType: QuestType.story }).maxRarity).toBe(
            RarityType.rare,
        );
        expect(
            optionsOf({ questType: QuestType.story, title: TitleType.legend })
                .maxRarity,
        ).toBe(RarityType.ultrarare);
        expect(optionsOf({ title: TitleType.rookie }).maxRarity).toBe(
            RarityType.common,
        );
    });

    it('filters the catalogue by the rarity cap (D-07)', () => {
        const options = optionsOf({ questType: QuestType.story });

        expect(options.equipmentIds).toEqual([
            EQUIP.common,
            EQUIP.uncommon,
            EQUIP.rare,
        ]);
        expect(options.lootIds).toEqual([
            LOOT.common,
            LOOT.uncommon,
            LOOT.rare,
        ]);
    });

    it('applies the same cap to the pets (D-07)', () => {
        expect(optionsOf().petIds).toEqual([
            PET.common,
            PET.uncommon,
            PET.rare,
            PET.ultrarare,
        ]);
        expect(optionsOf({ title: TitleType.rookie }).petIds).toEqual([
            PET.common,
        ]);
    });

    it('offers spells only to casters with enough xp and not known yet (D-07)', () => {
        expect(
            optionsOf({ title: TitleType.paladin, xp: 99999 }).spellIds,
        ).toEqual([]);
        expect(optionsOf({ knownSpellIds: [SPELL.known] }).spellIds).toEqual([
            SPELL.cheap,
            SPELL.exact,
        ]);
        expect(optionsOf().spellIds).toEqual([
            SPELL.cheap,
            SPELL.exact,
            SPELL.known,
        ]);
    });

    it('always allows the entries of the rank block (D-22)', () => {
        const options = optionsOf({
            title: TitleType.rookie,
            block: {
                prizeItem: {
                    itemType: 'EquipmentItem',
                    item: new Types.ObjectId(EQUIP.legendary),
                    quantity: 1,
                },
                randomLoot: [
                    {
                        itemType: 'LootItem',
                        item: new Types.ObjectId(LOOT.legendary),
                        quantity: 2,
                    },
                ],
                pet: new Types.ObjectId(PET.legendary),
                spell: new Types.ObjectId(SPELL.block),
            },
        });

        expect(options.equipmentIds).toEqual([EQUIP.common, EQUIP.legendary]);
        expect(options.lootIds).toEqual([LOOT.common, LOOT.legendary]);
        expect(options.petIds).toEqual([PET.common, PET.legendary]);

        const paladin = optionsOf({
            title: TitleType.paladin,
            block: { spell: SPELL.block },
        });
        expect(paladin.spellIds).toEqual([SPELL.block]);
    });

    it('refuses a prize outside the allowance (D-07)', () => {
        const options = optionsOf({ questType: QuestType.story });
        const allowed = {
            items: [
                { itemType: 'EquipmentItem', item: EQUIP.rare },
                { itemType: 'LootItem', item: LOOT.common },
            ],
            pet: PET.rare,
            spell: SPELL.cheap,
        };

        expect(() => assertPrizeAllowed(allowed, options)).not.toThrow();
        expect(() =>
            assertPrizeAllowed({ items: [], pet: null, spell: null }, options),
        ).not.toThrow();
        expect(
            codeOf(() =>
                assertPrizeAllowed(
                    {
                        ...allowed,
                        items: [
                            {
                                itemType: 'EquipmentItem',
                                item: EQUIP.legendary,
                            },
                        ],
                    },
                    options,
                ),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        expect(
            codeOf(() =>
                assertPrizeAllowed(
                    {
                        ...allowed,
                        items: [{ itemType: 'LootItem', item: EQUIP.rare }],
                    },
                    options,
                ),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        expect(
            codeOf(() =>
                assertPrizeAllowed({ ...allowed, pet: PET.legendary }, options),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        expect(
            codeOf(() =>
                assertPrizeAllowed(
                    { ...allowed, spell: SPELL.costly },
                    options,
                ),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
    });
});
