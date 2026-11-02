import { generateFixedQuests } from 'src/content/generation/fixed-quests.generator';
import {
    addedMonster,
    buildGeneratorIndex,
    GENERATOR_IDS as ids,
    generatorConfig,
    generatorInput,
    infosOf,
    prizesOf,
    questsOf,
    requirementsOf,
    withoutEnemies,
} from '../../../test/content/generator-world.fixture';

type Raw = Record<string, unknown>;

const DUNGEON_POIS = [
    ids.capitalDungeonPoi,
    ids.cityDungeonPoi,
    ids.villageDungeonPoi,
    ids.harkenDungeonPoi,
    ids.ferrionGlounetPoi,
    ids.necrorianGlounetPoi,
];

const ALL_MONSTERS = [
    ids.spider,
    ids.werewolf,
    ids.troll,
    ids.basilisk,
    ids.wraith,
    ids.beholder,
    ids.dragon,
    ids.kraken,
];

function dungeonAt(quests: Raw[], poi: string): Raw {
    const dungeon = quests.find(
        (quest) => infosOf(quest).markerLocation === poi,
    );
    if (!dungeon) throw new Error(`nessuna dungeon sul POI ${poi}`);
    return dungeon;
}

function itemsOf(loot: unknown): string[] {
    return (loot as { item: string }[]).map((entry) => entry.item);
}

function expectExplorationGear(gear: Raw[], allowed: string[]): void {
    expect(gear).toHaveLength(2);
    expect(new Set(itemsOf(gear)).size).toBe(2);
    for (const item of gear) {
        expect(item.itemType).toBe('LootItem');
        expect(item.quantity).toBe(1);
        expect(allowed).toContain(item.item);
    }
}

describe('generateFixedQuests dungeons', () => {
    const result = generateFixedQuests(generatorInput());
    const dungeons = questsOf(result, 'dungeon');

    it('creates one dungeon per dungeon point (D-20)', () => {
        expect(dungeons).toHaveLength(DUNGEON_POIS.length);
        expect(
            dungeons.map((dungeon) => infosOf(dungeon).markerLocation).sort(),
        ).toEqual([...DUNGEON_POIS].sort());
        expect(
            result.quests
                .filter((quest) => infosOf(quest.entry).type === 'dungeon')
                .map((quest) => quest.file),
        ).toEqual(DUNGEON_POIS.map(() => 'dungeon'));
    });

    it('picks a monster of the band of the city size (D-20)', () => {
        const village = dungeonAt(dungeons, ids.villageDungeonPoi);
        const city = dungeonAt(dungeons, ids.cityDungeonPoi);
        const capital = dungeonAt(dungeons, ids.capitalDungeonPoi);
        expect([ids.spider, ids.werewolf]).toContain(infosOf(village).enemy);
        expect(infosOf(city).enemy).toBe(ids.troll);
        expect(infosOf(capital).enemy).toBe(ids.wraith);
        expect(requirementsOf(village).minTitle).toBe('adventurer');
        expect(requirementsOf(city).minTitle).toBe('paladin');
        expect(requirementsOf(capital).minTitle).toBe('mage');
    });

    it('uses the hero band in Glounet, Harken and Necrorian (D-20)', () => {
        const harken = dungeonAt(dungeons, ids.harkenDungeonPoi);
        const ferrion = dungeonAt(dungeons, ids.ferrionGlounetPoi);
        const necrorian = dungeonAt(dungeons, ids.necrorianGlounetPoi);
        expect(infosOf(harken).enemy).toBe(ids.kraken);
        expect(infosOf(ferrion).enemy).toBe(ids.dragon);
        expect(infosOf(necrorian).enemy).toBe(ids.dragon);
        for (const dungeon of [harken, ferrion, necrorian]) {
            expect(requirementsOf(dungeon).minTitle).toBe('hero');
        }
    });

    it('falls back to a monster living everywhere, then to a lower band', () => {
        const capital = dungeonAt(dungeons, ids.capitalDungeonPoi);
        expect(infosOf(capital).enemy).toBe(ids.wraith);
        const golem = '6b0100000000000000000019';
        const lowered = questsOf(
            generateFixedQuests(
                generatorInput({
                    index: buildGeneratorIndex((world) => {
                        withoutEnemies(ids.wraith)(world);
                        addedMonster({
                            id: golem,
                            name: 'Golem delle rovine',
                            category: 'monster',
                            level: 8,
                            pe: 900,
                            locations: ['ruins'],
                        })(world);
                    }),
                }),
            ),
            'dungeon',
        );
        const fallback = dungeonAt(lowered, ids.capitalDungeonPoi);
        expect(infosOf(fallback).enemy).toBe(golem);
        expect(requirementsOf(fallback).minTitle).toBe('paladin');
    });

    it('never picks an animal or a legendary for a dungeon', () => {
        for (const dungeon of dungeons) {
            expect(ALL_MONSTERS).toContain(infosOf(dungeon).enemy);
        }
        const onlyOthers = questsOf(
            generateFixedQuests(
                generatorInput({
                    index: buildGeneratorIndex(withoutEnemies(...ALL_MONSTERS)),
                }),
            ),
            'dungeon',
        );
        expect(onlyOthers).toEqual([]);
    });

    it('rewards a random item of the band rarity (D-19)', () => {
        const config = generatorConfig();
        const index = buildGeneratorIndex();
        for (const dungeon of dungeons) {
            const [prize, ...others] = prizesOf(dungeon).randomLoot as Raw[];
            expect(others).toEqual([]);
            expect(prize.itemType).toBe('EquipmentItem');
            expect(prize.quantity).toBe(1);
            const item = index.byCollection.equipmentitems.get(
                prize.item as string,
            )!;
            const band = requirementsOf(dungeon).minTitle as 'mage';
            expect(item.raw.rarity).toBe(config.dungeonLootRarity[band]);
        }
    });

    it('falls back to the nearest lower rarity without items of the band rarity (D-19)', () => {
        const index = buildGeneratorIndex((world) => {
            world.entries.equipmentitems = world.entries.equipmentitems.filter(
                (item) => item.rarity !== 'ultrarare',
            );
        });
        const capital = dungeonAt(
            questsOf(generateFixedQuests(generatorInput({ index })), 'dungeon'),
            ids.capitalDungeonPoi,
        );
        expect(itemsOf(prizesOf(capital).randomLoot)).toHaveLength(1);
        expect([ids.flameSword, ids.acidAxe]).toContain(
            itemsOf(prizesOf(capital).randomLoot)[0],
        );
    });

    it('recommends weapons, healing, food and exploration gear within the band rarity (D-33)', () => {
        const city = requirementsOf(dungeonAt(dungeons, ids.cityDungeonPoi))
            .recommendedLoot as Raw[];
        expect(city.slice(0, 4)).toEqual([
            { itemType: 'EquipmentItem', item: ids.flameSword, quantity: 1 },
            { itemType: 'EquipmentItem', item: ids.acidAxe, quantity: 1 },
            { itemType: 'LootItem', item: ids.greaterPotion, quantity: 1 },
            { itemType: 'LootItem', item: ids.driedMeat, quantity: 1 },
        ]);
        expectExplorationGear(city.slice(4), [
            ids.lantern,
            ids.rope,
            ids.climbingKit,
        ]);
        const harken = requirementsOf(dungeonAt(dungeons, ids.harkenDungeonPoi))
            .recommendedLoot as Raw[];
        expect(harken.slice(0, 3)).toEqual([
            { itemType: 'EquipmentItem', item: ids.thunderSpear, quantity: 1 },
            { itemType: 'LootItem', item: ids.elixir, quantity: 1 },
            { itemType: 'LootItem', item: ids.elvenBread, quantity: 1 },
        ]);
        expectExplorationGear(harken.slice(3), [
            ids.lantern,
            ids.rope,
            ids.climbingKit,
            ids.ancientMap,
        ]);
    });

    it('sets the min title from the enemy band', () => {
        const index = buildGeneratorIndex();
        for (const dungeon of dungeons) {
            const enemy = index.byCollection.enemies.get(
                infosOf(dungeon).enemy as string,
            )!;
            const level = (enemy.raw.source as { level: number }).level;
            const expected =
                level <= 4
                    ? 'adventurer'
                    : level <= 10
                      ? 'paladin'
                      : level <= 16
                        ? 'mage'
                        : 'hero';
            expect(requirementsOf(dungeon).minTitle).toBe(expected);
        }
    });

    it('reports a dungeon point without any compatible monster as skipped', () => {
        const empty = generateFixedQuests(
            generatorInput({
                index: buildGeneratorIndex(withoutEnemies(...ALL_MONSTERS)),
            }),
        );
        expect(empty.skipped).toContainEqual({
            city: ids.necrorian,
            poi: ids.necrorianGlounetPoi,
            type: 'dungeon',
            reason: 'nessun mostro compatibile',
        });
        expect(
            empty.skipped.filter((skip) => skip.type === 'dungeon'),
        ).toHaveLength(DUNGEON_POIS.length);
    });

    it('describes the dungeon with the monster and the city (D-32)', () => {
        const index = buildGeneratorIndex();
        for (const dungeon of dungeons) {
            const monster = index.namesById.get(
                infosOf(dungeon).enemy as string,
            )!;
            const city = index.cities.get(dungeon.city as string)!.name;
            expect(infosOf(dungeon).description).toContain(monster);
            expect(infosOf(dungeon).description).toContain(city);
        }
    });

    it('links the city lore and the monster lore (D-22)', () => {
        const index = buildGeneratorIndex();
        for (const dungeon of dungeons) {
            const enemy = index.byCollection.enemies.get(
                infosOf(dungeon).enemy as string,
            )!;
            const lore = infosOf(dungeon).relatedLore as string[];
            expect(lore.slice(1)).toEqual(enemy.raw.relatedLore);
        }
    });
});
