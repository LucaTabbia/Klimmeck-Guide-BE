// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo delle debolezze dei nemici con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import type { Types } from 'mongoose';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { EnemyWeaknessesStep } from './enemy-weaknesses.step';
import { insertLegacy, legacyEnemy, rawById } from './legacy-fixtures';

const OLD_FIELDS = ['baseWeaknesses', 'energyWeaknesses'];

describe('EnemyWeaknessesStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: EnemyWeaknessesStep;

    const insertEnemy = (
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, Enemy.name, legacyEnemy(overrides));

    const rawEnemy = (id: Types.ObjectId) =>
        rawById(harness.connection, Enemy.name, id);

    const insertMigrated = (weaknesses: Record<string, unknown>) =>
        insertEnemy({
            baseWeaknesses: undefined,
            energyWeaknesses: undefined,
            weaknesses,
        });

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Enemy.name, schema: EnemySchema },
                ]),
            ],
            providers: [EnemyWeaknessesStep],
        });
        step = harness.app.get(EnemyWeaknessesStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('moves both lists into the sub-document and drops the two fields (D-01)', async () => {
        const id = await insertEnemy({
            baseWeaknesses: ['cut', 'blunt'],
            energyWeaknesses: ['fire'],
        });

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const stored = await rawEnemy(id);
        expect(stored?.weaknesses).toEqual({
            base: ['cut', 'blunt'],
            energy: ['fire'],
        });
        expect(
            Object.keys(stored ?? {}).filter((key) => OLD_FIELDS.includes(key)),
        ).toEqual([]);
        expect(Object.keys(stored ?? {}).sort()).toEqual(
            [
                ...Object.keys(legacyEnemy()).filter(
                    (key) => !OLD_FIELDS.includes(key),
                ),
                '_id',
                'weaknesses',
            ].sort(),
        );
    });

    it('fills an empty list for a missing or null one (D-01)', async () => {
        const onlyEnergy = await insertEnemy({
            baseWeaknesses: undefined,
            energyWeaknesses: ['cold'],
        });
        const neither = await insertEnemy({
            baseWeaknesses: undefined,
            energyWeaknesses: undefined,
        });
        const nullBase = await insertEnemy({
            baseWeaknesses: null,
            energyWeaknesses: ['acid'],
        });

        await step.run();

        expect((await rawEnemy(onlyEnergy))?.weaknesses).toEqual({
            base: [],
            energy: ['cold'],
        });
        expect((await rawEnemy(neither))?.weaknesses).toEqual({
            base: [],
            energy: [],
        });
        const storedNullBase = await rawEnemy(nullBase);
        expect(storedNullBase?.weaknesses).toEqual({
            base: [],
            energy: ['acid'],
        });
        expect(
            Object.keys(storedNullBase ?? {}).filter((key) =>
                OLD_FIELDS.includes(key),
            ),
        ).toEqual([]);
    });

    it('leaves an enemy that already has the sub-document untouched (D-01)', async () => {
        const id = await insertMigrated({ base: ['pierce'], energy: [] });
        const before = await rawEnemy(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 1,
            unmatched: 0,
        });

        expect(await rawEnemy(id)).toEqual(before);
    });

    it('changes nothing on a second run (D-01)', async () => {
        const ids = [
            await insertEnemy({ baseWeaknesses: ['cut'] }),
            await insertEnemy({ energyWeaknesses: ['fire', 'cold'] }),
            await insertMigrated({ base: [], energy: ['force'] }),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(ids.map(rawEnemy));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(ids.map(rawEnemy))).toEqual(afterFirstRun);
    });

    it('counts the enemies with a value outside the enums without fixing them (D-01)', async () => {
        const id = await insertEnemy({
            baseWeaknesses: ['cut', 'laser'],
            energyWeaknesses: ['fire'],
        });
        await insertEnemy({ baseWeaknesses: ['cut'] });

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 1,
        });

        expect((await rawEnemy(id))?.weaknesses).toEqual({
            base: ['cut', 'laser'],
            energy: ['fire'],
        });
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
