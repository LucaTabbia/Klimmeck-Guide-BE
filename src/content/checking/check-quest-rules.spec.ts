import { checkContent } from 'src/content/checking/check-content';
import { ContentTree } from 'src/content/loading/content-tree';
import {
    addCity,
    addEntry,
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';

const WOLF_ID = '64b000000000000000000101';
const GOLEM_ID = '64b000000000000000000102';
const VILLAGE_ID = '64b0000000000000000000c1';
const VILLAGE_MARKER_ID = '64b0000000000000000000d1';
const FOREST_POI_ID = '64b0000000000000000000d2';
const DUNGEON_POI_ID = '64b0000000000000000000d3';
const HEAL_QUEST_ID = '64b000000000000000000301';
const HUNT_QUEST_ID = '64b000000000000000000302';
const NEW_CITY_ID = '64b0000000000000000000c7';
const NEW_MARKER_ID = '64b0000000000000000000d7';
const SWORD_ID = '64b0000000000000000000e1';
const POTION_ID = '64b0000000000000000000f1';

type Raw = Record<string, unknown>;

function questOf(
    id: string,
    cityId: string,
    type: string,
    markerLocation: string,
    prizes: Raw = {},
): Raw {
    return {
        id,
        city: cityId,
        infos: {
            title: `Quest ${type} di prova`,
            description: `Annuncio della quest ${type} di prova.`,
            type,
            enemy: null,
            markerLocation,
            relatedLore: [],
        },
        requirements: { minTitle: 'adventurer', recommendedLoot: [] },
        prizes: { randomLoot: [], ...prizes },
    };
}

function sectionOf(raw: Raw, key: string): Raw {
    return raw[key] as Raw;
}

describe('checkContent fixed quest rules', () => {
    let tree: ContentTree;

    function addNewCity(name: string, type: string): void {
        addCity(tree, {
            id: NEW_CITY_ID,
            name,
            type,
            markerLocation: NEW_MARKER_ID,
            relatedLore: null,
            pointsOfInterest: [
                { id: NEW_MARKER_ID, type: ['city'], location: [11, 47] },
            ],
        });
    }

    function errorsAt(entryId: string, path: string): string[] {
        return checkContent(tree)
            .errors.filter(
                (issue) => issue.entryId === entryId && issue.path === path,
            )
            .map((issue) => issue.message);
    }

    beforeEach(() => {
        tree = loadTestContentTree();
    });

    it('rejects a hunt on a monster (D-18)', () => {
        sectionOf(entryOf(tree, 'quests', HUNT_QUEST_ID), 'infos').enemy =
            GOLEM_ID;

        expect(errorsAt(HUNT_QUEST_ID, 'infos.enemy')).toEqual([
            'la hunt vuole un animale, non monster (D-18)',
        ]);
    });

    it('rejects a hunt on an animal above 200 PE (D-18)', () => {
        sectionOf(entryOf(tree, 'enemies', WOLF_ID), 'source').pe = 250;

        expect(errorsAt(HUNT_QUEST_ID, 'infos.enemy')).toEqual([
            'animale oltre 200 PE: 250 (D-18)',
        ]);
    });

    it('rejects a hunt above rookie (D-18)', () => {
        sectionOf(
            entryOf(tree, 'quests', HUNT_QUEST_ID),
            'requirements',
        ).minTitle = 'adventurer';

        expect(errorsAt(HUNT_QUEST_ID, 'requirements.minTitle')).toEqual([
            'la hunt è sempre rookie (D-18)',
        ]);
    });

    it('rejects a hunt on the city marker or on a dungeon (D-21)', () => {
        const infos = sectionOf(
            entryOf(tree, 'quests', HUNT_QUEST_ID),
            'infos',
        );
        infos.markerLocation = DUNGEON_POI_ID;

        expect(errorsAt(HUNT_QUEST_ID, 'infos.markerLocation')).toEqual([
            'la hunt non va su un POI dungeon (D-21)',
        ]);

        infos.markerLocation = VILLAGE_MARKER_ID;

        expect(errorsAt(HUNT_QUEST_ID, 'infos.markerLocation')).toEqual([
            'la hunt va su un POI della zona, non sul marker della città (D-21)',
        ]);
    });

    it('rejects a service quest away from the city marker (D-21)', () => {
        sectionOf(
            entryOf(tree, 'quests', HEAL_QUEST_ID),
            'infos',
        ).markerLocation = FOREST_POI_ID;

        expect(errorsAt(HEAL_QUEST_ID, 'infos.markerLocation')).toContain(
            'la quest heal sta sul marker della città (D-21)',
        );
    });

    it('rejects an enemy on a service quest (D-21)', () => {
        sectionOf(entryOf(tree, 'quests', HEAL_QUEST_ID), 'infos').enemy =
            WOLF_ID;

        expect(errorsAt(HEAL_QUEST_ID, 'infos.enemy')).toEqual([
            'la quest heal non ha nemico (D-21)',
        ]);
    });

    it('rejects anything but dungeons at Necrorian (D-17)', () => {
        addNewCity('Necrorian', 'necrorianCity');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'heal',
                NEW_MARKER_ID,
            ),
        );

        expect(errorsAt('64b0000000000000000003a1', 'infos.type')).toEqual([
            'a Necrorian solo dungeon (D-17)',
        ]);
    });

    it('rejects crime at Ferrion (D-17)', () => {
        addNewCity('Ferrion', 'ferrionCity');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'crime',
                NEW_MARKER_ID,
            ),
        );

        expect(errorsAt('64b0000000000000000003a1', 'infos.type')).toEqual([
            'mai crime a Ferrion (D-17)',
        ]);
    });

    it('accepts the spell draw on the Valantar study (D-31)', () => {
        addNewCity('Valantar', 'valanCapital');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'study',
                NEW_MARKER_ID,
                {
                    spellDraw: true,
                },
            ),
        );

        expect(checkContent(tree).errors).toEqual([]);
    });

    it('rejects a spell draw outside the Valantar study (D-31)', () => {
        sectionOf(entryOf(tree, 'quests', HEAL_QUEST_ID), 'prizes').spellDraw =
            true;

        expect(errorsAt(HEAL_QUEST_ID, 'prizes.spellDraw')).toEqual([
            'il sorteggio della magia è solo sulla study della città valanCapital (D-31)',
        ]);
    });

    it('keys the spell draw on the valanCapital type, not on the name (D-31)', () => {
        addNewCity('Valantar Nuova', 'valanCapital');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'study',
                NEW_MARKER_ID,
                { spellDraw: true },
            ),
        );

        expect(
            errorsAt('64b0000000000000000003a1', 'prizes.spellDraw'),
        ).toEqual([]);
    });

    it('rejects a spell draw at a city named Valantar of another type (D-31)', () => {
        addNewCity('Valantar', 'drusteaCapital');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'study',
                NEW_MARKER_ID,
                { spellDraw: true },
            ),
        );

        expect(
            errorsAt('64b0000000000000000003a1', 'prizes.spellDraw'),
        ).toEqual([
            'il sorteggio della magia è solo sulla study della città valanCapital (D-31)',
        ]);
    });

    it('rejects the Valantar study without the spell draw (D-31)', () => {
        addNewCity('Valantar', 'valanCapital');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'study',
                NEW_MARKER_ID,
            ),
        );

        expect(
            errorsAt('64b0000000000000000003a1', 'prizes.spellDraw'),
        ).toEqual([
            'la study della città valanCapital sorteggia la magia: serve spellDraw: true (D-31)',
        ]);
    });

    it('rejects two spell draws (D-31)', () => {
        addNewCity('Valantar', 'valanCapital');
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                NEW_CITY_ID,
                'study',
                NEW_MARKER_ID,
                {
                    spellDraw: true,
                },
            ),
        );
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a2',
                NEW_CITY_ID,
                'study',
                NEW_MARKER_ID,
                {
                    spellDraw: true,
                },
            ),
        );

        expect(
            errorsAt('64b0000000000000000003a2', 'prizes.spellDraw'),
        ).toEqual([
            'sorteggio della magia già sulla quest 64b0000000000000000003a1 (D-31)',
        ]);
    });

    it('rejects a fixed spell outside a study (D-31)', () => {
        sectionOf(entryOf(tree, 'quests', HEAL_QUEST_ID), 'prizes').spell =
            '64b0000000000000000000b1';

        expect(errorsAt(HEAL_QUEST_ID, 'prizes.spell')).toEqual([
            'prizes.spell solo su una study (D-31)',
        ]);
    });

    it('rejects a dungeon on a POI without the dungeon type (D-20)', () => {
        const dungeon = questOf(
            '64b0000000000000000003a1',
            VILLAGE_ID,
            'dungeon',
            FOREST_POI_ID,
        );
        sectionOf(dungeon, 'infos').enemy = GOLEM_ID;
        sectionOf(
            entryOf(tree, 'quests', HUNT_QUEST_ID),
            'infos',
        ).markerLocation = '64b0000000000000000000d5';
        addEntry(tree, 'quests', dungeon);

        expect(
            errorsAt('64b0000000000000000003a1', 'infos.markerLocation'),
        ).toEqual(['la dungeon va su un POI di tipo dungeon (D-20)']);
    });

    it('rejects a dungeon on an animal (D-20)', () => {
        const dungeon = questOf(
            '64b0000000000000000003a1',
            VILLAGE_ID,
            'dungeon',
            DUNGEON_POI_ID,
        );
        sectionOf(dungeon, 'infos').enemy = WOLF_ID;
        addEntry(tree, 'quests', dungeon);

        expect(errorsAt('64b0000000000000000003a1', 'infos.enemy')).toEqual([
            'la dungeon vuole un mostro, non animal (D-20)',
        ]);
    });

    it('rejects two fixed quests on the same non-marker POI (D-21)', () => {
        const dungeon = questOf(
            '64b0000000000000000003a1',
            VILLAGE_ID,
            'dungeon',
            DUNGEON_POI_ID,
        );
        sectionOf(dungeon, 'infos').enemy = GOLEM_ID;
        addEntry(tree, 'quests', dungeon);
        const second = questOf(
            '64b0000000000000000003a2',
            VILLAGE_ID,
            'dungeon',
            DUNGEON_POI_ID,
        );
        sectionOf(second, 'infos').enemy = GOLEM_ID;
        addEntry(tree, 'quests', second);

        expect(
            errorsAt('64b0000000000000000003a1', 'infos.markerLocation'),
        ).toEqual([]);
        expect(
            errorsAt('64b0000000000000000003a2', 'infos.markerLocation'),
        ).toEqual([
            'POI già occupato dalla quest 64b0000000000000000003a1 (D-21)',
        ]);
    });

    it('rejects the same quest type twice on the city marker (D-21)', () => {
        addEntry(
            tree,
            'quests',
            questOf(
                '64b0000000000000000003a1',
                VILLAGE_ID,
                'heal',
                VILLAGE_MARKER_ID,
            ),
        );

        expect(
            errorsAt('64b0000000000000000003a1', 'infos.markerLocation'),
        ).toEqual([
            'heal già presente su questo marker: 64b000000000000000000301 (D-21)',
        ]);
    });

    it('rejects a deleteQuests fix aimed at a quest of the files (ME-02)', () => {
        const fix = tree.fixes.find(
            (entry) => entry.raw.kind === 'deleteQuests',
        );
        fix!.raw.ids = ['64b000000000000000000399', HEAL_QUEST_ID];

        expect(
            checkContent(tree).errors.filter(
                (issue) => issue.entryId === 'delete-test-quests',
            ),
        ).toEqual([
            {
                file: fix!.file,
                line: fix!.line,
                entryId: 'delete-test-quests',
                path: 'ids',
                message: `la quest ${HEAL_QUEST_ID} è nei file quests/: una fix deleteQuests non può cancellarla`,
            },
        ]);
    });

    it('rejects a fixed quest without the notice description (D-32)', () => {
        delete sectionOf(entryOf(tree, 'quests', HEAL_QUEST_ID), 'infos')
            .description;

        expect(errorsAt(HEAL_QUEST_ID, 'infos.description')).toEqual([
            "la quest fissa vuole l'annuncio in infos.description (D-32)",
        ]);
    });

    it('rejects recommended loot above the rarity of the minTitle tier (D-33)', () => {
        entryOf(tree, 'equipmentitems', SWORD_ID).rarity = 'legendary';
        entryOf(tree, 'lootitems', POTION_ID).rarity = 'uncommon';
        sectionOf(
            entryOf(tree, 'quests', HUNT_QUEST_ID),
            'requirements',
        ).recommendedLoot = [
            { itemType: 'EquipmentItem', item: SWORD_ID, quantity: 1 },
            { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
        ];

        expect(
            checkContent(tree)
                .errors.filter((issue) => issue.entryId === HUNT_QUEST_ID)
                .map(({ path, message }) => [path, message]),
        ).toEqual([
            [
                'requirements.recommendedLoot.0.item',
                'Spada di Prova è legendary: oltre la rarità common di rookie (D-33)',
            ],
            [
                'requirements.recommendedLoot.1.item',
                'Pozione di Prova è uncommon: oltre la rarità common di rookie (D-33)',
            ],
        ]);
    });

    it('accepts recommended loot within the rarity of the minTitle tier (D-33)', () => {
        entryOf(tree, 'lootitems', POTION_ID).rarity = 'uncommon';
        const heal = entryOf(tree, 'quests', HEAL_QUEST_ID);
        sectionOf(heal, 'requirements').minTitle = 'adventurer';
        sectionOf(heal, 'requirements').recommendedLoot = [
            { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            { itemType: 'EquipmentItem', item: SWORD_ID, quantity: 1 },
        ];

        expect(
            errorsAt(HEAL_QUEST_ID, 'requirements.recommendedLoot.0.item'),
        ).toEqual([]);
        expect(
            errorsAt(HEAL_QUEST_ID, 'requirements.recommendedLoot.1.item'),
        ).toEqual([]);
    });
});
