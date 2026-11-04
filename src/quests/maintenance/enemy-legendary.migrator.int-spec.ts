import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemyDocument, EnemySchema } from 'src/models/enemy.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildEnemy } from '../../../test/fixtures/enemy.fixture';
import {
    EnemyLegendaryMigrator,
    LEGENDARY_ENEMY_IDS,
} from './enemy-legendary.migrator';

const TARRASQUE = '6ae80b5b2e7351b494ecc869';
const KRAKEN = '6ae80b5b2e7351b494ecc86a';
const ORGEAL = '6ae80b5b2e7351b494ecc87e';
const BANDIT = '6ae80bf6947d6a423521c70d';
const BANDIT_CHIEF = '6ae80bf6947d6a423521c70f';

describe('EnemyLegendaryMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let enemies: Model<EnemyDocument>;
    let migrator: EnemyLegendaryMigrator;

    async function insertEnemy(
        hex: string,
        overrides: Record<string, unknown> = {},
    ): Promise<void> {
        await enemies.collection.insertOne({
            ...buildEnemy(overrides),
            _id: new Types.ObjectId(hex),
        });
    }

    async function legendaryOf(hex: string): Promise<unknown> {
        const raw = await enemies.collection.findOne({
            _id: new Types.ObjectId(hex),
        });
        return raw?.legendary;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Enemy.name, schema: EnemySchema },
                ]),
            ],
        });
        enemies = harness.app.get<Model<EnemyDocument>>(
            getModelToken(Enemy.name),
        );
        migrator = new EnemyLegendaryMigrator(enemies as never);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('pins the 22 legendary enemy ids (D-04)', () => {
        const expected = Array.from(
            { length: 22 },
            (_, offset) =>
                `6ae80b5b2e7351b494ecc8${(0x69 + offset).toString(16)}`,
        );

        expect(LEGENDARY_ENEMY_IDS.length).toBe(22);
        expect(new Set(LEGENDARY_ENEMY_IDS).size).toBe(22);
        expect([...LEGENDARY_ENEMY_IDS]).toEqual(expected);
        expect(LEGENDARY_ENEMY_IDS[0]).toBe(TARRASQUE);
        expect(LEGENDARY_ENEMY_IDS[21]).toBe(ORGEAL);
    });

    it('marks the 22 legendaries true and every other enemy false where the flag is missing (D-04)', async () => {
        await insertEnemy(TARRASQUE);
        await insertEnemy(KRAKEN);
        await insertEnemy(ORGEAL);
        await insertEnemy(BANDIT);
        await insertEnemy(BANDIT_CHIEF);

        const report = await migrator.migrate();

        expect(report).toEqual({ legendary: 3, ordinary: 2 });
        expect(await legendaryOf(TARRASQUE)).toBe(true);
        expect(await legendaryOf(KRAKEN)).toBe(true);
        expect(await legendaryOf(ORGEAL)).toBe(true);
        expect(await legendaryOf(BANDIT)).toBe(false);
        expect(await legendaryOf(BANDIT_CHIEF)).toBe(false);
    });

    it('keeps a flag curated by hand (D-04)', async () => {
        await insertEnemy(BANDIT, { legendary: true });
        await insertEnemy(KRAKEN, { legendary: false });

        const report = await migrator.migrate();

        expect(report).toEqual({ legendary: 0, ordinary: 0 });
        expect(await legendaryOf(BANDIT)).toBe(true);
        expect(await legendaryOf(KRAKEN)).toBe(false);
    });

    it('writes nothing on the second run (D-04)', async () => {
        await insertEnemy(TARRASQUE);
        await insertEnemy(BANDIT);
        await migrator.migrate();

        const second = await migrator.migrate();

        expect(second).toEqual({ legendary: 0, ordinary: 0 });
        expect(await legendaryOf(TARRASQUE)).toBe(true);
        expect(await legendaryOf(BANDIT)).toBe(false);
    });
});
