import {
    copyFileSync,
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { parse } from 'yaml';
import { checkContent } from 'src/content/checking/check-content';
import {
    CONFIG_FILE,
    CONTENT_COLLECTIONS,
    loadContentTree,
} from 'src/content/loading/content-tree';
import { mapContentTree } from 'src/content/mapping/map-content';
import { sameBson } from 'src/content/sync/bson-diff';
import { runContent } from 'src/content/sync/content-sync';
import {
    loadTestContentTree,
    TEST_CONTENT_DIR,
} from '../../../test/fixtures/content-tree.fixture';
import { seedWorld } from '../../../test/content/seed-world';
import { ExportDirNotEmptyError, exportContent } from './export-content';

const DB_NAME = 'content-export-test';
const EXPORT_DAY = new Date('2026-11-02T10:00:00Z');
const IMAGE_LORE = new ObjectId('64b0000000000000000000a9');
const CLOUDINARY_IMAGE =
    'https://res.cloudinary.com/klimmeck/image/upload/v1/lore/rovine.png';
const LEGACY_SWORD = new ObjectId('64b0000000000000000000e9');

const EXPECTED_FILES = [
    'enemies/esistenti.yaml',
    'equipment/weapon.yaml',
    'loot/heal.yaml',
    'lore/citta-esistenti.yaml',
    'lore/esistenti.yaml',
    'pets/cavalcature.yaml',
    'spells/attack.yaml',
    'world/cities.yaml',
];

describe('exportContent (replSet)', () => {
    let client: MongoClient;
    let db: Db;
    let dir: string;

    const read = (file: string): string =>
        readFileSync(join(dir, file), 'utf8');

    beforeAll(async () => {
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(DB_NAME);
    });

    beforeEach(async () => {
        await db.dropDatabase();
        const tree = loadTestContentTree();
        await seedWorld(db, tree.world ?? []);
        const seeded = await runContent(db, 'apply', tree);
        expect(seeded.errors).toEqual([]);
        dir = mkdtempSync(join(tmpdir(), 'content-export-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    afterAll(async () => {
        await db.dropDatabase();
        await client.close();
    });

    it('exports the catalog and the world snapshot into an empty folder, without fixes (D-04, ME-01)', async () => {
        const report = await exportContent(db, dir, EXPORT_DAY);

        expect(report.mode).toBe('export');
        expect(report.files.map(({ file }) => file)).toEqual(EXPECTED_FILES);
        for (const file of EXPECTED_FILES) {
            expect(existsSync(join(dir, file))).toBe(true);
            expect(read(file)).toContain(
                '# Esportato da --export il 2026-11-02: da qui in poi il file è la fonte di verità (D-04)',
            );
        }
        expect(report.counts).toEqual({
            lore: 3,
            enemies: 2,
            pets: 1,
            spells: 1,
            equipmentitems: 1,
            lootitems: 1,
            cities: 2,
            pointsofinterest: 5,
        });
        expect(existsSync(join(dir, 'fixes'))).toBe(false);
        expect(read('lore/citta-esistenti.yaml')).toContain(
            "city: '64b0000000000000000000c1' # Borgo di Prova",
        );
        expect(read('world/cities.yaml')).toContain(
            "markerLocation: '64b0000000000000000000d1' # Borgo di Prova — POI city",
        );
    });

    it('refuses a folder that is not empty', async () => {
        writeFileSync(join(dir, 'curato.yaml'), '[]\n');

        await expect(exportContent(db, dir, EXPORT_DAY)).rejects.toBeInstanceOf(
            ExportDirNotEmptyError,
        );
        expect(readdirSync(dir)).toEqual(['curato.yaml']);
    });

    it('round-trips: exported files map back to the same documents', async () => {
        await exportContent(db, dir, EXPORT_DAY);
        copyFileSync(
            join(TEST_CONTENT_DIR, CONFIG_FILE),
            join(dir, CONFIG_FILE),
        );

        const exported = loadContentTree(dir);
        expect(checkContent(exported).errors).toEqual([]);
        const mapped = mapContentTree(exported);

        for (const collection of CONTENT_COLLECTIONS) {
            if (collection === 'quests') continue;
            const documents = mapped.documents[collection];
            expect(documents).toHaveLength(
                await db.collection(collection).countDocuments(),
            );
            for (const document of documents) {
                const stored = await db
                    .collection(collection)
                    .findOne({ _id: document._id }, { promoteValues: false });
                for (const field of Object.keys(document.set)) {
                    const same = sameBson(stored?.[field], document.set[field]);
                    expect({ collection, field, same }).toEqual({
                        collection,
                        field,
                        same: true,
                    });
                }
            }
        }
    });

    it('keeps the Cloudinary image of an exported lore (D-04)', async () => {
        await db.collection('lore').insertOne({
            _id: IMAGE_LORE,
            type: 'region',
            image: CLOUDINARY_IMAGE,
            name: 'Rovine con immagine',
            description: 'Rovine antiche.',
            relatedLore: [],
            unlocked: true,
            __v: 0,
        });

        await exportContent(db, dir, EXPORT_DAY);

        const regions = parse(read('lore/esistenti.yaml')) as Record<
            string,
            unknown
        >[];
        const lore = regions.find(({ id }) => id === IMAGE_LORE.toHexString());
        expect(lore).toEqual(
            expect.objectContaining({ image: CLOUDINARY_IMAGE }),
        );
        expect(lore).not.toHaveProperty('unlocked');
    });

    it('reports a damages object normalized into a list', async () => {
        await db.collection('equipmentitems').insertOne({
            _id: LEGACY_SWORD,
            name: 'Spada legacy',
            itemType: 'EquipmentItem',
            description: 'Una lama vecchia.',
            sellPrice: null,
            buyPrice: null,
            rarity: 'common',
            equipType: 'weapon',
            addedSpell: null,
            damages: { base: { type: 'cut', power: 300 }, energy: [] },
            legacyStock: 2,
        });

        const report = await exportContent(db, dir, EXPORT_DAY);

        expect(report.normalized).toEqual([
            {
                collection: 'equipmentitems',
                id: LEGACY_SWORD.toHexString(),
                fields: ['damages.base'],
            },
        ]);
        expect(report.droppedFields.equipmentitems).toEqual(['legacyStock']);
        const weapons = parse(read('equipment/weapon.yaml')) as Record<
            string,
            unknown
        >[];
        expect(
            weapons.find(({ id }) => id === LEGACY_SWORD.toHexString()),
        ).toEqual(
            expect.objectContaining({
                damages: { base: [{ type: 'cut', power: 300 }], energy: [] },
            }),
        );
    });
});
