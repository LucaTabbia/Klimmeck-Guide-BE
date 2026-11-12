import { fromCopper } from 'src/economy/coins';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    GENERATED_PRIZES,
    GeneratedQuestType,
    LOOT_POOLS,
    PrizeCatalogItem,
    prizesOf,
} from 'src/quests/generation/generated-prizes';
import { PetCandidate } from 'src/quests/generation/pet-prize';
import {
    GENERATED_RANKS,
    GeneratedRank,
} from 'src/quests/generation/generation-rules';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const equipment = (id: string, rarity: RarityType): PrizeCatalogItem => ({
    itemType: 'EquipmentItem',
    id,
    rarity,
    equipType: 'weapon',
});

const loot = (
    id: string,
    rarity: RarityType,
    effect: EffectType = EffectType.heal,
): PrizeCatalogItem => ({ itemType: 'LootItem', id, rarity, effect });

const RARITIES = [
    RarityType.common,
    RarityType.uncommon,
    RarityType.rare,
    RarityType.ultrarare,
    RarityType.legendary,
];

// sei oggetti per rarità: tre equipaggiamenti e tre consumabili
const catalog: PrizeCatalogItem[] = RARITIES.flatMap((rarity) => [
    equipment(`${rarity}-e1`, rarity),
    equipment(`${rarity}-e2`, rarity),
    equipment(`${rarity}-e3`, rarity),
    loot(`${rarity}-l1`, rarity),
    loot(`${rarity}-l2`, rarity),
    loot(`${rarity}-l3`, rarity),
]);

const QUEST_ENEMY = 'e1';
const QUEST_POI_TYPE = 'forest';

const pet = (
    id: string,
    overrides: Partial<PetCandidate> = {},
): PetCandidate => ({
    id,
    rarity: RarityType.common,
    sellable: false,
    enemyId: null,
    enemyLocations: [],
    ...overrides,
});

// due mai in vendita (p2, p3), uno legato al nemico della quest (p1), uno della zona (p3)
const pets: PetCandidate[] = [
    pet('p2'),
    pet('p1', { sellable: true, enemyId: QUEST_ENEMY }),
    pet('p3', { enemyId: 'e9', enemyLocations: [QUEST_POI_TYPE] }),
];

const NO_LOOT: PrizeCatalogItem[] = [];

const rarityOf = (id: string): string =>
    catalog.find((entry) => entry.id === id)?.rarity ?? 'missing';

function draw(
    type: GeneratedQuestType,
    rank: GeneratedRank,
    chance: ChanceSource = new SequenceChance([], 0),
    items: readonly PrizeCatalogItem[] = catalog,
) {
    return prizesOf({
        type,
        rank,
        catalog: items,
        pets,
        enemyIds: [QUEST_ENEMY],
        poiTypes: [QUEST_POI_TYPE],
        chance,
    });
}

function countByRarity(ids: readonly string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const id of ids) {
        const rarity = rarityOf(id);
        counts[rarity] = (counts[rarity] ?? 0) + 1;
    }
    return counts;
}

describe('generated quest types', () => {
    it('generates only enemy and boss quests, never a magic one (quick 261110-mag)', () => {
        expect(Object.keys(GENERATED_PRIZES).sort()).toEqual([
            QuestType.boss,
            QuestType.enemy,
        ]);
    });
});

describe('prizesOf', () => {
    it('pays coins and xp from the table times the rank multiplier (D-19)', () => {
        const enemyPaladin = draw(QuestType.enemy, TitleType.paladin);
        expect(enemyPaladin.prizeCoins).toEqual(fromCopper(750));
        expect(enemyPaladin.xpPrize).toBe(200);

        const bossHero = draw(QuestType.boss, TitleType.hero);
        expect(bossHero.prizeCoins).toEqual(fromCopper(15000));
        expect(bossHero.xpPrize).toBe(3000);
    });

    it('draws the boss loot pool of a hero quest (D-20)', () => {
        const { randomLoot } = draw(QuestType.boss, TitleType.hero);
        const ids = randomLoot.map((entry) => entry.item);

        expect(countByRarity(ids)).toEqual({
            legendary: 1,
            ultrarare: 2,
            rare: 4,
        });
        expect(new Set(ids).size).toBe(7);
        expect(randomLoot.every((entry) => entry.quantity === 1)).toBe(true);
    });

    it('draws the enemy loot pools one step below (D-20)', () => {
        const mage = draw(QuestType.enemy, TitleType.mage).randomLoot.map(
            (entry) => entry.item,
        );
        expect(countByRarity(mage)).toEqual({ rare: 1, uncommon: 2 });

        const one = draw(
            QuestType.enemy,
            TitleType.adventurer,
            new SequenceChance([0]),
        );
        expect(countByRarity(one.randomLoot.map((e) => e.item))).toEqual({
            common: 1,
        });

        const two = draw(
            QuestType.enemy,
            TitleType.adventurer,
            new SequenceChance([0.6], 0),
        );
        expect(countByRarity(two.randomLoot.map((e) => e.item))).toEqual({
            common: 2,
        });
    });

    it('never puts a legendary item below hero (D-20)', () => {
        const allowed = ['boss/hero'];
        for (const type of [QuestType.enemy, QuestType.boss] as const) {
            for (const rank of GENERATED_RANKS) {
                const hasLegendary = LOOT_POOLS[type][rank].some(
                    (slot) => slot.rarity === RarityType.legendary,
                );
                expect({ pool: `${type}/${rank}`, hasLegendary }).toEqual({
                    pool: `${type}/${rank}`,
                    hasLegendary: allowed.includes(`${type}/${rank}`),
                });
            }
        }

        for (let seed = 1; seed <= 100; seed += 1) {
            for (const rank of [TitleType.paladin, TitleType.mage] as const) {
                for (const type of [QuestType.enemy, QuestType.boss] as const) {
                    const { randomLoot } = draw(
                        type,
                        rank,
                        new SeededChanceSource(seed),
                    );
                    const rarities = randomLoot.map((e) => rarityOf(e.item));
                    expect(rarities).not.toContain(RarityType.legendary);
                }
            }
        }
    });

    it('keeps food out of the pools from rare up (D-20)', () => {
        const items = [
            loot('food-rare', RarityType.rare, EffectType.hunger),
            loot('food-common', RarityType.common, EffectType.hunger),
        ];

        const rare = draw(
            QuestType.enemy,
            TitleType.mage,
            new SequenceChance([], 0),
            items,
        );
        expect(rare.randomLoot).toEqual([]);

        const common = draw(
            QuestType.enemy,
            TitleType.rookie,
            new SequenceChance([0], 0),
            items,
        );
        expect(common.randomLoot).toEqual([
            { itemType: 'LootItem', item: 'food-common', quantity: 1 },
        ]);
    });

    it('includes the unique items of the historical figures in their rarity (D-31)', () => {
        const relic = equipment('relic-of-a-hero', RarityType.legendary);
        const { randomLoot } = draw(
            QuestType.boss,
            TitleType.hero,
            new SequenceChance([], 0),
            [relic, equipment('u1', RarityType.ultrarare)],
        );

        expect(randomLoot).toEqual([
            { itemType: 'EquipmentItem', item: 'relic-of-a-hero', quantity: 1 },
            { itemType: 'EquipmentItem', item: 'u1', quantity: 1 },
        ]);
    });

    it('offers the pet linked to a quest enemy on an enemy quest too (D-28)', () => {
        const { pet: offered } = draw(
            QuestType.enemy,
            TitleType.paladin,
            new SequenceChance([0.05, 0]),
            NO_LOOT,
        );

        expect(offered).toBe('p1');
    });

    it('offers a boss-only pet in the third band (D-28)', () => {
        const onType = (type: GeneratedQuestType) =>
            draw(
                type,
                TitleType.paladin,
                new SequenceChance([0.17, 0]),
                NO_LOOT,
            ).pet;

        expect(onType(QuestType.boss)).toBe('p2');
        expect(onType(QuestType.enemy)).toBeNull();
    });

    it('draws the pet roll after the loot on every generated quest (D-28)', () => {
        const withoutPets = new SequenceChance([0], 0);
        const none = prizesOf({
            type: QuestType.enemy,
            rank: TitleType.paladin,
            catalog: NO_LOOT,
            pets: [],
            enemyIds: [QUEST_ENEMY],
            poiTypes: [QUEST_POI_TYPE],
            chance: withoutPets,
        });
        expect(none.pet).toBeNull();
        expect(withoutPets.drawn).toEqual([0]);

        const afterLoot = new SequenceChance([0.9, 0.9, 0.9, 0.05, 0]);
        const full = draw(QuestType.enemy, TitleType.paladin, afterLoot);
        expect(full.randomLoot).toHaveLength(3);
        expect(full.pet).toBe('p1');
        expect(afterLoot.drawn).toEqual([0.9, 0.9, 0.9, 0.05, 0]);
    });

    it('offers no pet when the roll misses every band (D-28)', () => {
        const chance = new SequenceChance([0.2, 0]);

        expect(
            draw(QuestType.boss, TitleType.paladin, chance, NO_LOOT).pet,
        ).toBeNull();
        expect(chance.drawn).toEqual([0.2]);
    });

    it('shrinks a pool slot to what the catalogue has (D-20)', () => {
        const { randomLoot } = draw(
            QuestType.boss,
            TitleType.hero,
            new SequenceChance([], 0),
            [loot('only-rare', RarityType.rare)],
        );

        expect(randomLoot).toEqual([
            { itemType: 'LootItem', item: 'only-rare', quantity: 1 },
        ]);
    });
});
