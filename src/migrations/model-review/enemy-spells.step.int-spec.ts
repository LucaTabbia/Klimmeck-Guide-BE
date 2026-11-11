// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo delle magie dei nemici con documenti grezzi — esce dal repo dopo il boot reale
import { Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { mongo, Types } from 'mongoose';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildSpell } from '../../../test/fixtures/spell.fixture';
import { EnemySpellsStep } from './enemy-spells.step';
import {
    insertLegacy,
    legacyEnemyWithSpells,
    rawById,
    writeAfterNextRead,
} from './legacy-fixtures';

describe('EnemySpellsStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: EnemySpellsStep;
    let warnSpy: jest.SpyInstance;

    const insertCatalogSpell = (name: string): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, Spell.name, buildSpell({ name }));

    const copyOf = (name: string, id?: Types.ObjectId) => ({
        ...(id ? { _id: id } : {}),
        ...buildSpell({ name }),
    });

    const insertEnemy = (copies: readonly unknown[]): Promise<Types.ObjectId> =>
        insertLegacy(
            harness.connection,
            Enemy.name,
            legacyEnemyWithSpells(copies),
        );

    const rawEnemy = (id: Types.ObjectId) =>
        rawById(harness.connection, Enemy.name, id);

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Enemy.name, schema: EnemySchema },
                    { name: Spell.name, schema: SpellSchema },
                ]),
            ],
            providers: [EnemySpellsStep],
        });
        step = harness.app.get(EnemySpellsStep);
    });

    beforeEach(() => {
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        warnSpy.mockRestore();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('replaces the embedded copies with the catalogue ids (D-02)', async () => {
        const fireball = await insertCatalogSpell('Palla di fuoco');
        const frost = await insertCatalogSpell('Soffio gelido');
        const id = await insertEnemy([
            copyOf('Palla di fuoco', fireball),
            copyOf('Soffio gelido', new Types.ObjectId()),
        ]);
        const before = await rawEnemy(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect(await rawEnemy(id)).toEqual({
            ...before,
            spells: [fireball, frost],
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('never writes an enemy with a copy without a match: every copy stays and is reported (D-02, C-WR-04)', async () => {
        const fireball = await insertCatalogSpell('Palla di fuoco');
        await insertCatalogSpell('Gemella');
        await insertCatalogSpell('Gemella');
        const lost = await insertEnemy([
            copyOf('Palla di fuoco', fireball),
            copyOf('Magia perduta', new Types.ObjectId()),
        ]);
        const ambiguous = await insertEnemy([
            copyOf('Gemella', new Types.ObjectId()),
            copyOf('Palla di fuoco', fireball),
        ]);
        const matched = await insertEnemy([copyOf('Palla di fuoco', fireball)]);
        const before = [await rawEnemy(lost), await rawEnemy(ambiguous)];

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 2,
        });

        expect([await rawEnemy(lost), await rawEnemy(ambiguous)]).toEqual(
            before,
        );
        expect((await rawEnemy(matched))?.spells).toEqual([fireball]);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Revisione dei modelli, magie dei nemici: copia senza corrispondenza «Magia perduta» sul nemico ${lost.toHexString()}: nemico non scritto, le copie restano`,
            ],
            [
                `Revisione dei modelli, magie dei nemici: copia senza corrispondenza «Gemella» sul nemico ${ambiguous.toHexString()}: nemico non scritto, le copie restano`,
            ],
        ]);
    });

    it('leaves for the next boot an enemy written while the step runs (C-WR-02)', async () => {
        const fireball = await insertCatalogSpell('Palla di fuoco');
        const frost = await insertCatalogSpell('Soffio gelido');
        const id = await insertEnemy([copyOf('Palla di fuoco', fireball)]);
        const curated = [
            copyOf('Palla di fuoco', fireball),
            copyOf('Soffio gelido', frost),
        ];
        const enemies = harness.connection.model(Enemy.name).collection;
        // una cura a mano cade fra la lettura e la scrittura del passo
        writeAfterNextRead(harness.connection, Enemy.name, () =>
            enemies.updateOne({ _id: id }, { $set: { spells: curated } }),
        );

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 1,
        });

        expect((await rawEnemy(id))?.spells).toEqual(curated);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Revisione dei modelli, magie dei nemici: nemico ${id.toHexString()} cambiato durante il passo, scrittura non applicata: si ritenta al prossimo boot`,
            ],
        ]);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });
        expect((await rawEnemy(id))?.spells).toEqual([fireball, frost]);
    });

    it('still writes an enemy whose copies store numbers as doubles or longs (C-WR-02)', async () => {
        const fireball = await insertCatalogSpell('Palla di fuoco');
        const id = await insertEnemy([
            {
                ...copyOf('Palla di fuoco', fireball),
                maxUsages: new mongo.Double(3),
                cooldown: mongo.Long.fromNumber(7),
                nested: { power: new mongo.Double(40), since: new Date(0) },
            },
        ]);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect((await rawEnemy(id))?.spells).toEqual([fireball]);
    });

    it('skips an enemy whose spells are already references (D-02)', async () => {
        const fireball = await insertCatalogSpell('Palla di fuoco');
        const withRefs = await insertEnemy([fireball, new Types.ObjectId()]);
        const withoutSpells = await insertEnemy([]);
        const before = [
            await rawEnemy(withRefs),
            await rawEnemy(withoutSpells),
        ];

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 0,
            alreadyDone: 2,
            unmatched: 0,
        });

        expect([
            await rawEnemy(withRefs),
            await rawEnemy(withoutSpells),
        ]).toEqual(before);
    });

    it('changes nothing on a second run and reports again the enemy it did not write (D-02, C-WR-04)', async () => {
        const fireball = await insertCatalogSpell('Palla di fuoco');
        const ids = [
            await insertEnemy([copyOf('Palla di fuoco')]),
            await insertEnemy([
                copyOf('Magia perduta'),
                copyOf('Palla di fuoco', fireball),
            ]),
            await insertEnemy([fireball]),
        ];
        const unmatchedCopies = (await rawEnemy(ids[1]))?.spells;
        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 1,
            alreadyDone: 1,
            unmatched: 1,
        });
        const afterFirstRun = await Promise.all(ids.map(rawEnemy));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 2,
            unmatched: 1,
        });

        expect(await Promise.all(ids.map(rawEnemy))).toEqual(afterFirstRun);
        expect(afterFirstRun.map((enemy) => enemy?.spells)).toEqual([
            [fireball],
            unmatchedCopies,
            [fireball],
        ]);
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
