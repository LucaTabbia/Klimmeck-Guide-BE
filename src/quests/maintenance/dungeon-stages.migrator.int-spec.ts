import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemyDocument, EnemySchema } from 'src/models/enemy.model';
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
import { buildEnemy } from '../../../test/fixtures/enemy.fixture';
import { buildPoi } from '../../../test/fixtures/poi.fixture';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { BANDIT_ID } from './dungeon-stages';
import { DungeonStagesMigrator } from './dungeon-stages.migrator';

describe('DungeonStagesMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let enemies: Model<EnemyDocument>;
    let pois: Model<PointOfInterestDocument>;
    let migrator: DungeonStagesMigrator;
    let warnSpy: jest.SpyInstance;
    let current: Types.ObjectId;
    let dungeonPoi: Types.ObjectId;

    async function insertEnemy(
        name: string,
        xp: number,
        locations: string[],
    ): Promise<Types.ObjectId> {
        const { insertedId } = await enemies.collection.insertOne({
            ...buildEnemy({ name, xp }),
            locations,
            legendary: false,
        });
        return insertedId;
    }

    async function insertDungeon(
        entries: { enemy: Types.ObjectId; quantity: number }[],
        overrides: {
            minTitle?: string;
            concludedAt?: Date | null;
            markerLocation?: Types.ObjectId;
        } = {},
    ): Promise<Types.ObjectId> {
        const quest = buildQuest();
        const { insertedId } = await quests.collection.insertOne({
            ...quest,
            infos: {
                ...quest.infos,
                type: 'dungeon',
                markerLocation: overrides.markerLocation ?? dungeonPoi,
                enemies: entries,
            },
            requirements: {
                ...quest.requirements,
                minTitle: overrides.minTitle ?? 'adventurer',
            },
            concludedAt: overrides.concludedAt ?? null,
        });
        return insertedId;
    }

    // una grotta dove vive solo il Bandito, fuori da ogni forma rookie: la banda è l'unica tappa possibile
    async function insertBanditCave(): Promise<Types.ObjectId> {
        await enemies.collection.insertOne({
            ...buildEnemy({ name: 'Bandito', xp: 1000 }),
            _id: new Types.ObjectId(BANDIT_ID),
            locations: ['cave'],
            legendary: false,
        });
        const { insertedId } = await pois.collection.insertOne(
            buildPoi({ type: ['dungeon', 'cave'] }),
        );
        return insertedId;
    }

    async function enemiesOf(id: Types.ObjectId): Promise<unknown> {
        const raw = await quests.collection.findOne({ _id: id });
        return (raw?.infos as { enemies?: unknown } | undefined)?.enemies;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: Enemy.name, schema: EnemySchema },
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                ]),
            ],
        });
        quests = harness.app.get<Model<QuestDocument>>(
            getModelToken(Quest.name),
        );
        enemies = harness.app.get<Model<EnemyDocument>>(
            getModelToken(Enemy.name),
        );
        pois = harness.app.get<Model<PointOfInterestDocument>>(
            getModelToken(PointOfInterest.name),
        );
        migrator = new DungeonStagesMigrator(
            quests as never,
            enemies as never,
            pois as never,
        );
    });

    beforeEach(async () => {
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        current = await insertEnemy('Orso', 30, ['forest']);
        await insertEnemy('Lupo', 10, ['forest']);
        await insertEnemy('Guardia corrotta', 22, ['city']);
        const { insertedId } = await pois.collection.insertOne(
            buildPoi({ type: ['dungeon', 'forest'] }),
        );
        dungeonPoi = insertedId;
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('enriches the open fixed dungeons with at most one enemy (D-13)', async () => {
        const id = await insertDungeon([{ enemy: current, quantity: 1 }]);

        const report = await migrator.migrate();

        const stages = (await enemiesOf(id)) as {
            enemy: Types.ObjectId;
            quantity: number;
        }[];
        expect(report).toEqual({ enriched: 1, skipped: 0 });
        expect(stages.length).toBeGreaterThanOrEqual(2);
        expect(stages.length).toBeLessThanOrEqual(4);
        expect(stages[0]).toEqual({ enemy: current, quantity: 1 });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('leaves a dungeon already curated with several enemies untouched (D-13)', async () => {
        const curated = [
            { enemy: current, quantity: 1 },
            { enemy: current, quantity: 2 },
        ];
        const id = await insertDungeon(curated);
        const concluded = await insertDungeon(
            [{ enemy: current, quantity: 1 }],
            {
                concludedAt: new Date('2026-11-01T00:00:00Z'),
            },
        );

        const report = await migrator.migrate();

        expect(report).toEqual({ enriched: 0, skipped: 0 });
        expect(await enemiesOf(id)).toEqual(curated);
        expect(await enemiesOf(concluded)).toEqual([
            { enemy: current, quantity: 1 },
        ]);
    });

    it('skips a dungeon whose minTitle is not a generated rank and warns with its id (D-13)', async () => {
        const legend = await insertDungeon([{ enemy: current, quantity: 1 }], {
            minTitle: 'legend',
        });

        const report = await migrator.migrate();

        expect(report).toEqual({ enriched: 0, skipped: 1 });
        expect(await enemiesOf(legend)).toEqual([
            { enemy: current, quantity: 1 },
        ]);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Dungeon ${legend.toHexString()} con minTitle non generabile: saltata`,
            ],
        ]);
    });

    it('writes nothing on the second run (D-13)', async () => {
        const id = await insertDungeon([{ enemy: current, quantity: 1 }]);
        await migrator.migrate();
        const first = await enemiesOf(id);

        const second = await migrator.migrate();

        expect(second).toEqual({ enriched: 0, skipped: 0 });
        expect(await enemiesOf(id)).toEqual(first);
    });

    it('leaves an enemyless dungeon that would get a single stage untouched (D-13)', async () => {
        const cave = await insertBanditCave();
        const id = await insertDungeon([], {
            minTitle: 'rookie',
            markerLocation: cave,
        });

        const report = await migrator.migrate();

        expect(report).toEqual({ enriched: 0, skipped: 1 });
        expect(await enemiesOf(id)).toEqual([]);
    });

    it('enriches nothing on the second run of a mixed world (D-13)', async () => {
        const cave = await insertBanditCave();
        await insertDungeon([{ enemy: current, quantity: 1 }]);
        await insertDungeon([], { minTitle: 'rookie', markerLocation: cave });

        const first = await migrator.migrate();
        const second = await migrator.migrate();

        expect(first).toEqual({ enriched: 1, skipped: 1 });
        expect(second).toEqual({ enriched: 0, skipped: 1 });
    });
});
