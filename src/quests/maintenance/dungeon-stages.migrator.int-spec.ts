import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { Enemy, EnemyDocument, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreDocument, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildCity } from '../../../test/fixtures/city.fixture';
import { buildEnemy } from '../../../test/fixtures/enemy.fixture';
import { buildLore } from '../../../test/fixtures/lore.fixture';
import { buildPoi } from '../../../test/fixtures/poi.fixture';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { DungeonStagesMigrator } from './dungeon-stages.migrator';

interface RawStage {
    enemy: Types.ObjectId;
    quantity: number;
}

interface RawDungeon {
    infos: {
        title: string;
        description: string;
        enemies: RawStage[];
    };
    requirements: { minTitle: string };
}

interface WorldEnemy {
    name: string;
    xp: number;
    animal: boolean;
}

const DESCRIPTION = 'Una grotta umida dove nessuno torna da solo.';

describe('DungeonStagesMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let enemies: Model<EnemyDocument>;
    let lore: Model<LoreDocument>;
    let pois: Model<PointOfInterestDocument>;
    let cities: Model<CityDocument>;
    let migrator: DungeonStagesMigrator;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let bestiary: Types.ObjectId;
    let forestPoi: Types.ObjectId;
    let bandit: Types.ObjectId;
    let bear: Types.ObjectId;
    let troll: Types.ObjectId;
    let wolf: Types.ObjectId;
    let world: Map<string, WorldEnemy>;

    async function insertEnemy(
        name: string,
        xp: number,
        animal = false,
    ): Promise<Types.ObjectId> {
        const { insertedId } = await enemies.collection.insertOne({
            ...buildEnemy({ name, xp }),
            locations: ['forest'],
            legendary: false,
            relatedLore: animal ? [bestiary] : [],
        });
        world.set(insertedId.toHexString(), { name, xp, animal });
        return insertedId;
    }

    async function insertPoi(type: string[]): Promise<Types.ObjectId> {
        const { insertedId } = await pois.collection.insertOne(
            buildPoi({ type }),
        );
        return insertedId;
    }

    async function insertDungeon(
        stages: readonly RawStage[],
        options: {
            minTitle?: string;
            poi?: Types.ObjectId;
            title?: string;
            startedAt?: Date | null;
        } = {},
    ): Promise<Types.ObjectId> {
        const quest = buildQuest();
        const { insertedId } = await quests.collection.insertOne({
            ...quest,
            infos: {
                ...quest.infos,
                timeToComplete: 3600000,
                title: options.title ?? 'Dungeon: Orso presso Bosa',
                type: 'dungeon',
                description: DESCRIPTION,
                markerLocation: options.poi ?? forestPoi,
                enemies: stages,
            },
            requirements: {
                ...quest.requirements,
                minTitle: options.minTitle ?? 'adventurer',
            },
            startedAt: options.startedAt ?? null,
            concludedAt: null,
        });
        return insertedId;
    }

    async function rawDungeon(id: Types.ObjectId): Promise<RawDungeon> {
        return (await quests.collection.findOne({
            _id: id,
        })) as unknown as RawDungeon;
    }

    const stage = (enemy: Types.ObjectId, quantity = 1): RawStage => ({
        enemy,
        quantity,
    });

    function expectComposed(
        dungeon: RawDungeon,
        budget: { min: number; max: number },
    ): void {
        const stages = dungeon.infos.enemies;
        expect(stages.length).toBeGreaterThanOrEqual(2);
        expect(stages.length).toBeLessThanOrEqual(4);
        const drawn = stages.map((entry) => {
            const enemy = world.get(entry.enemy.toHexString());
            expect(enemy).toBeDefined();
            return { xp: (enemy?.xp ?? 0) * entry.quantity, enemy };
        });
        expect(drawn.filter(({ enemy }) => enemy?.animal)).toEqual([]);
        const sum = drawn.reduce((total, { xp }) => total + xp, 0);
        expect(sum).toBeGreaterThanOrEqual(budget.min);
        expect(sum).toBeLessThanOrEqual(budget.max);
    }

    const firstNameOf = (dungeon: RawDungeon): string | undefined =>
        world.get(dungeon.infos.enemies[0].enemy.toHexString())?.name;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: Enemy.name, schema: EnemySchema },
                    { name: Lore.name, schema: LoreSchema },
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                    { name: City.name, schema: CitySchema },
                ]),
            ],
        });
        quests = harness.app.get(getModelToken(Quest.name));
        enemies = harness.app.get(getModelToken(Enemy.name));
        lore = harness.app.get(getModelToken(Lore.name));
        pois = harness.app.get(getModelToken(PointOfInterest.name));
        cities = harness.app.get(getModelToken(City.name));
        migrator = new DungeonStagesMigrator(
            quests as never,
            enemies as never,
            lore as never,
            pois as never,
            cities as never,
        );
    });

    beforeEach(async () => {
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        world = new Map();
        ({ insertedId: bestiary } = await lore.collection.insertOne(
            buildLore({ type: 'animal', name: 'Bestiario' }),
        ));
        bandit = await insertEnemy('Bandito', 4);
        await insertEnemy('Goblin', 10);
        bear = await insertEnemy('Orso', 28);
        troll = await insertEnemy('Troll', 63);
        wolf = await insertEnemy('Lupo', 28, true);
        forestPoi = await insertPoi(['forest']);
        await cities.collection.insertOne(
            buildCity({ name: 'Bosa', pointsOfInterest: [forestPoi] }),
        );
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('recomposes an open dungeon with an animal stage (D-07)', async () => {
        const dungeon = await insertDungeon([stage(bear), stage(wolf)]);

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 1,
            coherent: 0,
            skipped: 0,
        });

        const after = await rawDungeon(dungeon);
        expectComposed(after, { min: 21, max: 69 });
        expect(after.infos.enemies[0]).toEqual(stage(bear));
        expect(after.infos.title).toBe('Dungeon: Orso presso Bosa');
        expect(after.infos.description).toBe(DESCRIPTION);
        expect(logSpy.mock.calls).toEqual([
            ['Dungeon: 1 ricomposte, 0 già coerenti'],
        ]);
    });

    it('retitles a dungeon whose first enemy is replaced and keeps its description (D-07)', async () => {
        const dungeon = await insertDungeon([stage(wolf), stage(bear)], {
            title: 'Dungeon: Lupo presso Bosa',
        });
        const orphanPoi = await insertPoi(['forest']);
        const orphan = await insertDungeon([stage(wolf), stage(bear)], {
            title: 'Dungeon: Lupo presso Kliever',
            poi: orphanPoi,
        });

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 2,
            coherent: 0,
            skipped: 0,
        });

        const after = await rawDungeon(dungeon);
        expectComposed(after, { min: 21, max: 69 });
        expect(after.infos.title).toBe(
            `Dungeon: ${firstNameOf(after)} presso Bosa`,
        );
        expect(firstNameOf(after)).not.toBe('Lupo');
        expect(after.infos.description).toBe(DESCRIPTION);
        const orphanAfter = await rawDungeon(orphan);
        expectComposed(orphanAfter, { min: 21, max: 69 });
        expect(orphanAfter.infos.title).toBe('Dungeon: Lupo presso Kliever');
        expect(orphanAfter.infos.description).toBe(DESCRIPTION);
    });

    it('recomposes a dungeon over the budget of its minTitle (D-07)', async () => {
        const dungeon = await insertDungeon([stage(troll), stage(bandit)], {
            minTitle: 'rookie',
        });

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 1,
            coherent: 0,
            skipped: 0,
        });

        const after = await rawDungeon(dungeon);
        expectComposed(after, { min: 1, max: 20 });
        expect(after.requirements.minTitle).toBe('rookie');
    });

    it('leaves a coherent dungeon untouched (D-07)', async () => {
        const dungeon = await insertDungeon([stage(bear), stage(bandit, 3)]);
        const before = await rawDungeon(dungeon);

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 0,
            coherent: 1,
            skipped: 0,
        });

        expect(await rawDungeon(dungeon)).toEqual(before);
        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('leaves a started dungeon untouched (D-07)', async () => {
        const dungeon = await insertDungeon([stage(wolf), stage(bear)], {
            startedAt: new Date('2026-11-01T10:00:00.000Z'),
        });
        const before = await rawDungeon(dungeon);

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 0,
            coherent: 0,
            skipped: 0,
        });

        expect(await rawDungeon(dungeon)).toEqual(before);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('skips a dungeon whose minTitle is not a generated rank and warns with its id (D-07)', async () => {
        const dungeon = await insertDungeon([stage(wolf), stage(bear)], {
            minTitle: 'legend',
        });
        const before = await rawDungeon(dungeon);

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 0,
            coherent: 0,
            skipped: 1,
        });

        expect(await rawDungeon(dungeon)).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Dungeon ${dungeon.toHexString()} con minTitle non generabile: saltata`,
            ],
        ]);
    });

    it('leaves a dungeon without composable stages and warns with its id (D-07)', async () => {
        const desert = await insertPoi(['desert']);
        const dungeon = await insertDungeon([stage(wolf), stage(bear)], {
            poi: desert,
        });
        const before = await rawDungeon(dungeon);

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 0,
            coherent: 0,
            skipped: 1,
        });

        expect(await rawDungeon(dungeon)).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Dungeon ${dungeon.toHexString()} senza tappe componibili: lasciata`,
            ],
        ]);
    });

    it('writes nothing on the second run (D-07)', async () => {
        const animal = await insertDungeon([stage(wolf), stage(bear)]);
        const overBudget = await insertDungeon([stage(troll)], {
            minTitle: 'rookie',
        });
        await migrator.migrate();
        const after = [await rawDungeon(animal), await rawDungeon(overBudget)];
        logSpy.mockClear();

        await expect(migrator.migrate()).resolves.toEqual({
            recomposed: 0,
            coherent: 2,
            skipped: 0,
        });

        expect([
            await rawDungeon(animal),
            await rawDungeon(overBudget),
        ]).toEqual(after);
        expect(logSpy).not.toHaveBeenCalled();
    });
});
