import { CONTENT_COLLECTIONS } from 'src/content/loading/content-tree';
import { assertNoUndefined } from 'src/content/mapping/canonical';
import { mapContentTree } from 'src/content/mapping/map-content';
import { loadTestContentTree } from '../../../test/fixtures/content-tree.fixture';

const VILLAGE_ID = '64b0000000000000000000c1';
const CITY_LORE_ID = '64b0000000000000000000a2';
const WOLF_ID = '64b000000000000000000101';
const GOLEM_ID = '64b000000000000000000102';
const ENEMY_IMAGE = 'https://res.cloudinary.com/klimmeck/image/upload/lupo.png';

describe('mapContentTree', () => {
    it('maps every collection of the test tree in load order (D-27)', () => {
        const mapped = mapContentTree(loadTestContentTree());

        const counts = CONTENT_COLLECTIONS.map(
            (collection) => mapped.documents[collection].length,
        );
        expect(Object.keys(mapped.documents)).toEqual([...CONTENT_COLLECTIONS]);
        expect(counts).toEqual([3, 1, 1, 1, 2, 1, 2]);
        expect(
            mapped.documents.enemies.map((doc) => doc._id.toHexString()),
        ).toEqual([WOLF_ID, GOLEM_ID]);
        expect(
            mapped.cityLore.map((update) => ({
                cityId: update.cityId.toHexString(),
                relatedLore: update.relatedLore.toHexString(),
            })),
        ).toEqual([{ cityId: VILLAGE_ID, relatedLore: CITY_LORE_ID }]);
    });

    it('applies the image links of images.yaml (D-24)', () => {
        const tree = loadTestContentTree();
        tree.images.enemies.push({ id: WOLF_ID, url: ENEMY_IMAGE });

        const mapped = mapContentTree(tree);

        expect(mapped.documents.enemies[0].set.imagePath).toBe(ENEMY_IMAGE);
    });

    it('produces no undefined value anywhere', () => {
        const mapped = mapContentTree(loadTestContentTree());

        expect(() => assertNoUndefined(mapped)).not.toThrow();
        expect(mapped.documents.quests[0].setOnInsert).not.toBeNull();
    });

    it('refuses a mapped document with an undefined value (LO-02)', () => {
        const tree = loadTestContentTree();
        delete tree.entries.lore[0].raw.description;

        expect(() => mapContentTree(tree)).toThrow(
            `Valore undefined in lore.${tree.entries.lore[0].raw.id as string}.set.description`,
        );
    });

    it('is deterministic', () => {
        const first = mapContentTree(loadTestContentTree());
        const second = mapContentTree(loadTestContentTree());

        expect(second).toEqual(first);
    });

    it('refuses a tree without a valid config', () => {
        const tree = loadTestContentTree();
        tree.config = null;

        expect(() => mapContentTree(tree)).toThrow('config.yaml');
    });
});
