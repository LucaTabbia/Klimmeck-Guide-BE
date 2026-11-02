import { generateFixedQuests } from 'src/content/generation/fixed-quests.generator';
import { QUEST_DESCRIPTIONS } from 'src/content/generation/quest-descriptions';
import type { DescriptionKind } from 'src/content/generation/quest-descriptions';
import { keyedChance } from 'src/content/generation/seeded-chance';
import {
    buildGeneratorIndex,
    GENERATOR_IDS as ids,
    generatorConfig,
    generatorInput,
    infosOf,
    prizesOf,
    questsOf,
    requirementsOf,
} from '../../../test/content/generator-world.fixture';

const SERVICE_TYPES = ['heal', 'job', 'guard', 'crime', 'study'];

const SERVED_CITIES = [
    ids.capital,
    ...ids.cities,
    ...ids.villages,
    ids.valantar,
    ids.liberia,
    ids.ferrion,
];

const CAPITALS = [ids.capital, ids.valantar, ids.liberia];

const TOWNS = [...ids.cities, ids.ferrion];

describe('generateFixedQuests service quests', () => {
    const result = generateFixedQuests(generatorInput());
    const index = buildGeneratorIndex();

    it('gives every city a heal and a job on its marker (D-17)', () => {
        for (const city of SERVED_CITIES) {
            const marker = index.cities.get(city)!.markerLocation;
            for (const type of ['heal', 'job']) {
                const quests = questsOf(result, type, city);
                expect(quests).toHaveLength(1);
                expect(infosOf(quests[0]).markerLocation).toBe(marker);
                expect(infosOf(quests[0]).enemy).toBeNull();
                expect(requirementsOf(quests[0]).minTitle).toBe('rookie');
            }
        }
    });

    it('gives Necrorian no service quest (D-17)', () => {
        for (const type of [...SERVICE_TYPES, 'hunt']) {
            expect(questsOf(result, type, ids.necrorian)).toEqual([]);
        }
    });

    it('puts guard in cities and capitals only (D-17)', () => {
        for (const city of [...CAPITALS, ...TOWNS]) {
            expect(questsOf(result, 'guard', city)).toHaveLength(1);
        }
        for (const village of ids.villages) {
            expect(questsOf(result, 'guard', village)).toEqual([]);
        }
    });

    it('puts crime in every capital and never at Ferrion (D-17)', () => {
        for (const capital of CAPITALS) {
            expect(questsOf(result, 'crime', capital)).toHaveLength(1);
        }
        expect(questsOf(result, 'crime', ids.ferrion)).toEqual([]);
        for (const village of ids.villages) {
            expect(questsOf(result, 'crime', village)).toEqual([]);
        }
    });

    it('draws crime in some cities but not all with the fixture seed', () => {
        const withCrime = ids.cities.filter(
            (city) => questsOf(result, 'crime', city).length === 1,
        );
        expect(withCrime.length).toBeGreaterThan(0);
        expect(withCrime.length).toBeLessThan(ids.cities.length);
    });

    it('puts a study in every capital and at Liberia (D-17)', () => {
        for (const capital of CAPITALS) {
            expect(questsOf(result, 'study', capital)).toHaveLength(1);
        }
        const [liberiaStudy] = questsOf(result, 'study', ids.liberia);
        expect(prizesOf(liberiaStudy).spellDraw).toBeUndefined();
        for (const village of ids.villages) {
            expect(questsOf(result, 'study', village)).toEqual([]);
        }
    });

    it('gives Valantar exactly one study and it draws the spell (D-31)', () => {
        const studies = questsOf(result, 'study', ids.valantar);
        expect(studies).toHaveLength(1);
        expect(prizesOf(studies[0])).toEqual({
            randomLoot: [],
            spellDraw: true,
        });
        expect(prizesOf(studies[0])).not.toHaveProperty('spell');
        const drawing = result.quests.filter(
            (quest) => prizesOf(quest.entry).spellDraw === true,
        );
        expect(drawing).toHaveLength(1);
    });

    it('uses adventurer in cities and paladin in capitals for guard, crime and study (D-20)', () => {
        for (const type of ['guard', 'crime', 'study']) {
            for (const city of TOWNS) {
                for (const quest of questsOf(result, type, city)) {
                    expect(requirementsOf(quest).minTitle).toBe('adventurer');
                }
            }
            for (const capital of CAPITALS) {
                for (const quest of questsOf(result, type, capital)) {
                    expect(requirementsOf(quest).minTitle).toBe('paladin');
                }
            }
        }
    });

    it('links the city lore in every quest (D-22)', () => {
        for (const { entry } of result.quests) {
            const n = [...index.cities.keys()].indexOf(entry.city as string);
            expect(infosOf(entry).relatedLore).toContain(ids.cityLore(n + 1));
        }
    });

    it('titles the quests in Italian with the city name (D-22)', () => {
        const [heal] = questsOf(result, 'heal', ids.valantar);
        const [spellStudy] = questsOf(result, 'study', ids.valantar);
        expect(infosOf(heal).title).toBe('Cure al tempio di Valantar');
        expect(infosOf(spellStudy).title).toBe('Studi arcani a Valantar');
    });

    it('files the service quests by kingdom', () => {
        const fileOf = (city: string) =>
            result.quests.find(
                (quest) =>
                    quest.entry.city === city &&
                    infosOf(quest.entry).type === 'heal',
            )?.file;
        expect(fileOf(ids.capital)).toBe('drustea');
        expect(fileOf(ids.valantar)).toBe('valan');
        expect(fileOf(ids.ferrion)).toBe('speciali');
    });

    it('writes the entry keys in the README order', () => {
        const [heal] = questsOf(result, 'heal', ids.capital);
        expect(Object.keys(heal)).toEqual([
            'id',
            'city',
            'infos',
            'requirements',
            'prizes',
        ]);
        expect(Object.keys(infosOf(heal))).toEqual([
            'title',
            'description',
            'type',
            'enemy',
            'markerLocation',
            'relatedLore',
        ]);
        expect(Object.keys(requirementsOf(heal))).toEqual([
            'minTitle',
            'recommendedLoot',
        ]);
    });

    it('describes every quest in the voice of its poster (D-32)', () => {
        for (const { entry } of result.quests) {
            const infos = infosOf(entry);
            const kind = (
                prizesOf(entry).spellDraw === true ? 'spellStudy' : infos.type
            ) as DescriptionKind;
            const names = {
                city: index.cities.get(entry.city as string)!.name,
                enemy:
                    typeof infos.enemy === 'string'
                        ? (index.namesById.get(infos.enemy) ?? '')
                        : '',
            };
            expect(
                QUEST_DESCRIPTIONS[kind].map((notice) => notice(names)),
            ).toContain(infos.description);
        }
    });

    it('keys the notice draw to the quest, not to the draw order (D-32)', () => {
        const capital = index.cities.get(ids.capital)!;
        const notices = QUEST_DESCRIPTIONS.heal;
        const chance = keyedChance(
            generatorConfig().generator.seed,
            `heal|${capital.markerLocation}|description`,
        );
        const drawn = Math.floor(chance.next() * notices.length);
        const [heal] = questsOf(result, 'heal', ids.capital);
        expect(infosOf(heal).description).toBe(
            notices[drawn]({ city: capital.name, enemy: '' }),
        );
    });

    it('reports a city without its city lore and still serves it', () => {
        const withoutLore = generateFixedQuests(
            generatorInput({
                index: buildGeneratorIndex((world) => {
                    world.entries.lore = world.entries.lore.filter(
                        (lore) => lore.id !== ids.cityLore(2),
                    );
                }),
            }),
        );
        const [heal] = questsOf(withoutLore, 'heal', ids.cities[0]);
        expect(infosOf(heal).relatedLore).toEqual([]);
        expect(withoutLore.skipped).toContainEqual({
            city: ids.cities[0],
            poi: null,
            type: '*',
            reason: 'città senza lore',
        });
    });
});
