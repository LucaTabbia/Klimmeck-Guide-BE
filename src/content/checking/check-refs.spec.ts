import { checkContent } from 'src/content/checking/check-content';
import { ContentTree } from 'src/content/loading/content-tree';
import {
    addEntry,
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';

const REGION_ID = '64b0000000000000000000a1';
const VILLAGE_LORE_ID = '64b0000000000000000000a2';
const WOLF_LORE_ID = '64b0000000000000000000a3';
const SPELL_ID = '64b0000000000000000000b1';
const LOOT_ID = '64b0000000000000000000f1';
const VILLAGE_ID = '64b0000000000000000000c1';
const CAPITAL_MARKER_ID = '64b0000000000000000000d4';
const HEAL_QUEST_ID = '64b000000000000000000301';
const MISSING_ID = '64b0000000000000000000ff';

describe('checkContent references and duplicates', () => {
    let tree: ContentTree;

    beforeEach(() => {
        tree = loadTestContentTree();
    });

    it('accepts the test content tree', () => {
        expect(checkContent(tree).errors).toEqual([]);
    });

    it('reports a related lore that does not exist (D-02)', () => {
        entryOf(tree, 'lore', REGION_ID).relatedLore = [MISSING_ID];

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                file: 'lore/esempio.yaml',
                entryId: REGION_ID,
                path: 'relatedLore.0',
                message: `riferimento pendente: ${MISSING_ID} non è in lore`,
            }),
        ]);
    });

    it('reports an id used twice in the same collection', () => {
        addEntry(tree, 'lore', {
            ...entryOf(tree, 'lore', WOLF_LORE_ID),
            name: 'Lupo Bis',
        });

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                file: 'lore/aggiunte.yaml',
                entryId: WOLF_LORE_ID,
                path: 'id',
                message: `id doppio in lore: ${WOLF_LORE_ID}`,
            }),
        ]);
    });

    it('reports an id shared by two collections', () => {
        entryOf(tree, 'spells', SPELL_ID).id = REGION_ID;

        const { errors } = checkContent(tree);

        expect(errors).toContainEqual(
            expect.objectContaining({
                file: 'spells/esempio.yaml',
                entryId: REGION_ID,
                path: 'id',
                message: `id già usato in lore: ${REGION_ID}`,
            }),
        );
    });

    it('reports a loot reference typed as equipment (Pitfall 9)', () => {
        const prizes = entryOf(tree, 'quests', HEAL_QUEST_ID).prizes as Record<
            string,
            unknown
        >;
        prizes.randomLoot = [
            { itemType: 'EquipmentItem', item: LOOT_ID, quantity: 1 },
        ];

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                entryId: HEAL_QUEST_ID,
                path: 'prizes.randomLoot.0.item',
                message: `${LOOT_ID} è in lootitems ma itemType è EquipmentItem`,
            }),
        ]);
    });

    it('reports a quest marker outside its city', () => {
        const infos = entryOf(tree, 'quests', HEAL_QUEST_ID).infos as Record<
            string,
            unknown
        >;
        infos.markerLocation = CAPITAL_MARKER_ID;

        expect(checkContent(tree).errors).toContainEqual(
            expect.objectContaining({
                entryId: HEAL_QUEST_ID,
                path: 'infos.markerLocation',
                message: `il marker ${CAPITAL_MARKER_ID} non è un POI di Borgo di Prova`,
            }),
        );
    });

    it('reports a city lore whose city is missing from the snapshot', () => {
        entryOf(tree, 'lore', VILLAGE_LORE_ID).city = MISSING_ID;

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                entryId: VILLAGE_LORE_ID,
                path: 'city',
                message: `città assente dallo snapshot: ${MISSING_ID}`,
            }),
        ]);
    });

    it('fails when a city is referenced without the world snapshot', () => {
        tree.world = null;

        const { errors } = checkContent(tree);

        expect(errors.length).toBeGreaterThan(0);
        expect(errors).toContainEqual(
            expect.objectContaining({
                entryId: VILLAGE_LORE_ID,
                path: 'city',
                message: 'snapshot world/cities.yaml mancante',
            }),
        );
        expect(errors).toContainEqual(
            expect.objectContaining({
                entryId: HEAL_QUEST_ID,
                path: 'city',
                message: 'snapshot world/cities.yaml mancante',
            }),
        );
    });

    it('reports prose ending with a newline', () => {
        entryOf(tree, 'lore', REGION_ID).description = 'Testo\n';

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                file: 'lore/esempio.yaml',
                entryId: REGION_ID,
                path: 'description',
            }),
        ]);
    });

    it('warns about two lore with the same name and type (D-02)', () => {
        addEntry(tree, 'lore', {
            id: '64b0000000000000000000a9',
            type: 'region',
            name: 'Regione di Prova',
            description: 'Un doppione.',
        });

        const { errors, warnings } = checkContent(tree);

        expect(errors).toEqual([]);
        expect(warnings).toContainEqual(
            expect.objectContaining({
                entryId: '64b0000000000000000000a9',
                path: 'name',
                message: 'nome doppio in lore (region): Regione di Prova',
            }),
        );
    });

    it('allows the same name across different types (D-02)', () => {
        const { warnings } = checkContent(tree);

        expect(warnings).not.toContainEqual(
            expect.objectContaining({
                message: expect.stringContaining('Lupo di Prova'),
            }),
        );
    });

    it('warns about a city without its lore (D-23)', () => {
        const { errors, warnings } = checkContent(tree);

        expect(errors).toEqual([]);
        expect(warnings).toEqual([
            expect.objectContaining({
                file: 'world/cities.yaml',
                entryId: '64b0000000000000000000c2',
                message: 'città senza lore: Capitale di Prova (drusteaCapital)',
            }),
        ]);
    });

    it('reports two lore for the same city (D-23)', () => {
        addEntry(tree, 'lore', {
            id: '64b0000000000000000000a9',
            type: 'city',
            name: 'Borgo di Prova, secondo',
            description: 'Una seconda scheda dello stesso borgo.',
            city: VILLAGE_ID,
        });

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                entryId: '64b0000000000000000000a9',
                path: 'city',
                message: `seconda lore per la città Borgo di Prova (già in ${VILLAGE_LORE_ID})`,
            }),
        ]);
    });

    it('reports an image for an unknown id (D-24)', () => {
        tree.images.lore.push({
            id: MISSING_ID,
            url: 'https://res.cloudinary.com/klimmeck/image/upload/x.png',
        });

        expect(checkContent(tree).errors).toEqual([
            expect.objectContaining({
                file: 'images.yaml',
                entryId: MISSING_ID,
                path: 'lore.0.id',
                message: `immagine per un id che non è in lore: ${MISSING_ID}`,
            }),
        ]);
    });
});
