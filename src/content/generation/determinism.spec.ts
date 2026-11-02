import { checkContent } from 'src/content/checking/check-content';
import { indexContent } from 'src/content/checking/content-index';
import { generateFixedQuests } from 'src/content/generation/fixed-quests.generator';
import {
    buildGeneratorTree,
    GENERATOR_IDS as ids,
    generatorInput,
    infosOf,
    NEW_ID_PREFIX,
    prizesOf,
    questsOf,
} from '../../../test/content/generator-world.fixture';

type Raw = Record<string, unknown>;

describe('generateFixedQuests determinism', () => {
    const first = generateFixedQuests(generatorInput());

    it('produces identical output for the same seed', () => {
        const second = generateFixedQuests(generatorInput());
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });

    it('draws differently with another seed', () => {
        const input = generatorInput();
        const reseeded = generateFixedQuests({
            ...input,
            config: {
                ...input.config,
                generator: { ...input.config.generator, seed: 12345 },
            },
        });
        expect(JSON.stringify(reseeded)).not.toBe(JSON.stringify(first));
    });

    it('reuses the id of an existing quest with the same type and marker (D-01)', () => {
        const [heal] = questsOf(first, 'heal', ids.capital);
        const keptId = '6b0300000000000000000001';
        const existing: Raw = {
            ...heal,
            id: keptId,
            infos: { ...infosOf(heal), title: 'Titolo vecchio' },
        };
        const again = generateFixedQuests(
            generatorInput({ existingQuests: [existing] }),
        );
        const [regenerated] = questsOf(again, 'heal', ids.capital);
        expect(regenerated.id).toBe(keptId);
        expect(infosOf(regenerated).title).toBe('Cure al tempio di Drustal');
    });

    it('assigns new ids only to new keys', () => {
        const existingQuests = first.quests.map((quest) => quest.entry);
        let calls = 0;
        const again = generateFixedQuests(
            generatorInput({
                existingQuests,
                newId: () => {
                    calls += 1;
                    return `${NEW_ID_PREFIX}ffffffffffffffffffff`;
                },
            }),
        );
        expect(calls).toBe(0);
        expect(again.quests.map((quest) => quest.entry.id)).toEqual(
            first.quests.map((quest) => quest.entry.id),
        );
        const ids = first.quests.map((quest) => quest.entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id).toMatch(new RegExp(`^${NEW_ID_PREFIX}[0-9a-f]{20}$`));
        }
    });

    it('keeps the Valantar spell study id across runs (D-31)', () => {
        const [spellStudy] = questsOf(first, 'study', ids.valantar);
        const keptId = '6b0300000000000000000002';
        const plainStudyHere: Raw = {
            ...spellStudy,
            id: '6b0300000000000000000003',
            prizes: { randomLoot: [] },
        };
        const again = generateFixedQuests(
            generatorInput({
                existingQuests: [plainStudyHere, { ...spellStudy, id: keptId }],
            }),
        );
        const [regenerated] = questsOf(again, 'study', ids.valantar);
        expect(regenerated.id).toBe(keptId);
        expect(prizesOf(regenerated).spellDraw).toBe(true);
    });

    it('keeps every main draw when the flavour items change (D-33)', () => {
        const withoutGear = generateFixedQuests(
            generatorInput({
                index: indexContent(
                    buildGeneratorTree((world) => {
                        world.entries.lootitems =
                            world.entries.lootitems.filter(
                                (item) => item.effect !== 'exploration',
                            );
                    }),
                ),
            }),
        );
        const coreOf = (result: typeof first) =>
            result.quests.map(({ file, entry }) => {
                const copy = JSON.parse(JSON.stringify(entry)) as {
                    infos: Raw;
                    requirements: Raw;
                };
                delete copy.infos.description;
                delete copy.requirements.recommendedLoot;
                return { file, entry: copy };
            });
        const descriptionsOf = (result: typeof first) =>
            result.quests.map((quest) => infosOf(quest.entry).description);
        expect(coreOf(withoutGear)).toEqual(coreOf(first));
        expect(descriptionsOf(withoutGear)).toEqual(descriptionsOf(first));
    });

    it('produces entries that pass the content checks', () => {
        const tree = buildGeneratorTree();
        tree.entries.quests = first.quests.map((quest, index) => ({
            file: `quests/${quest.file}.yaml`,
            line: index + 1,
            raw: quest.entry,
        }));
        expect(checkContent(tree).errors).toEqual([]);
    });
});
