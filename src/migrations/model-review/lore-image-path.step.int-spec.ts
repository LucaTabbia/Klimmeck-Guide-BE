// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo delle immagini delle lore con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { insertLegacy, legacyLore, rawById } from './legacy-fixtures';
import { LoreImagePathStep } from './lore-image-path.step';

const IMAGE = 'https://cdn.test/lore/drustea.png';

const LORE_KEYS = ['_id', 'description', 'name', 'relatedLore', 'type'];

describe('LoreImagePathStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: LoreImagePathStep;

    const insertLore = (
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, Lore.name, legacyLore(overrides));

    const rawLore = async (id: Types.ObjectId) =>
        (await rawById(harness.connection, Lore.name, id)) ?? {};

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Lore.name, schema: LoreSchema },
                ]),
            ],
            providers: [LoreImagePathStep],
        });
        step = harness.app.get(LoreImagePathStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('renames the image of a lore to its image path (D-11)', async () => {
        const withImage = await insertLore({ image: IMAGE });
        const withNullImage = await insertLore({ image: null });
        const untouched = untouchedFieldsOf(await rawLore(withImage));

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 0,
        });

        const renamed = await rawLore(withImage);
        expect(Object.keys(renamed).sort()).toEqual(
            [...LORE_KEYS, 'imagePath'].sort(),
        );
        expect(renamed).toEqual({ ...untouched, imagePath: IMAGE });
        const renamedNull = await rawLore(withNullImage);
        expect(Object.keys(renamedNull).sort()).toEqual(
            [...LORE_KEYS, 'imagePath'].sort(),
        );
        expect(renamedNull.imagePath).toBeNull();
    });

    it('leaves a lore without an image untouched (D-11)', async () => {
        const bare = await insertLore({ image: undefined });
        const alreadyRenamed = await insertLore({
            image: undefined,
            imagePath: IMAGE,
        });
        const before = [await rawLore(bare), await rawLore(alreadyRenamed)];

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 0,
            alreadyDone: 2,
            unmatched: 0,
        });

        expect(Object.keys(await rawLore(bare)).sort()).toEqual(LORE_KEYS);
        expect([await rawLore(bare), await rawLore(alreadyRenamed)]).toEqual(
            before,
        );
    });

    it('counts and leaves a lore that has both fields (D-11)', async () => {
        const both = await insertLore({
            image: IMAGE,
            imagePath: 'https://cdn.test/lore/curated.png',
        });
        const before = await rawLore(both);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 1,
        });

        expect(await rawLore(both)).toEqual(before);
    });

    it('changes nothing on a second run (D-11)', async () => {
        const lores = [
            await insertLore({ image: IMAGE }),
            await insertLore({ image: null }),
            await insertLore({ image: undefined }),
            await insertLore({ image: IMAGE, imagePath: IMAGE }),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(lores.map(rawLore));

        await expect(step.run()).resolves.toEqual({
            found: 4,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 1,
        });

        expect(await Promise.all(lores.map(rawLore))).toEqual(afterFirstRun);
    });

    it('reports zero on an empty collection (D-12)', async () => {
        await expect(step.run()).resolves.toEqual({
            found: 0,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 0,
        });
    });
});

// i campi della lore che il passo non deve toccare
function untouchedFieldsOf(lore: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(lore).filter(([key]) => LORE_KEYS.includes(key)),
    );
}
