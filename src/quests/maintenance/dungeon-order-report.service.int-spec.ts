import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { persistEnemy } from '../../../test/fixtures/enemy.fixture';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { DUNGEON_ORDER_REPORT_WARNINGS_LIMIT } from './dungeon-order.report';
import { DungeonOrderReportService } from './dungeon-order-report.service';

// utente 2026-11-13: «Nel caso del dungeon bisogna anche asssicurarsi che il nemico più forte sia presente nell'ultimo turno di combattimento»
describe('DungeonOrderReportService (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let enemies: Model<any>;
    let service: DungeonOrderReportService;
    let warnSpy: jest.SpyInstance;

    async function enemyWith(xp: number): Promise<Types.ObjectId> {
        const enemy = await persistEnemy(enemies, { xp });
        return enemy._id as Types.ObjectId;
    }

    async function insertQuest(
        type: string,
        groups: Types.ObjectId[],
        concludedAt: Date | null = null,
    ): Promise<Types.ObjectId> {
        const base = buildQuest();
        const { insertedId } = await quests.collection.insertOne({
            ...base,
            infos: {
                ...base.infos,
                type,
                enemies: groups.map((enemy) => ({ enemy, quantity: 1 })),
            },
            concludedAt,
        });
        return insertedId;
    }

    function rawQuests() {
        return quests.collection.find().sort({ _id: 1 }).toArray();
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: Enemy.name, schema: EnemySchema },
                ]),
            ],
        });
        quests = harness.app.get<Model<QuestDocument>>(
            getModelToken(Quest.name),
        );
        enemies = harness.app.get<Model<any>>(getModelToken(Enemy.name));
        service = new DungeonOrderReportService(
            quests as never,
            enemies as never,
        );
    });

    beforeEach(() => {
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('stays silent when every open dungeon ends on its strongest enemy (quick 261113-aql)', async () => {
        const weak = await enemyWith(20);
        const strong = await enemyWith(120);
        await insertQuest('dungeon', [weak, weak, strong]);
        await insertQuest('dungeon', [strong]);
        await insertQuest('boss', [strong, weak]);

        await expect(service.report()).resolves.toEqual({
            checked: 2,
            outOfOrder: 0,
        });

        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('reports an open dungeon whose strongest enemy is not last and writes nothing (quick 261113-aql)', async () => {
        const weak = await enemyWith(20);
        const strong = await enemyWith(120);
        const misplaced = await insertQuest('dungeon', [weak, strong, weak]);
        await insertQuest(
            'dungeon',
            [strong, weak],
            new Date('2026-11-01T00:00:00Z'),
        );
        await insertQuest('dungeon', [weak, strong]);
        const before = await rawQuests();

        await expect(service.report()).resolves.toEqual({
            checked: 2,
            outOfOrder: 1,
        });

        expect(await rawQuests()).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Ordine della dungeon: missione ${misplaced.toHexString()} senza il nemico più forte all'ultimo gruppo`,
            ],
            ['Ordine della dungeon: 1 dungeon da riordinare su 2'],
        ]);
    });

    it('caps the warnings and closes with the counts (quick 261113-aql)', async () => {
        const weak = await enemyWith(20);
        const strong = await enemyWith(120);
        const total = DUNGEON_ORDER_REPORT_WARNINGS_LIMIT + 1;
        for (let i = 0; i < total; i++)
            await insertQuest('dungeon', [strong, weak]);

        await expect(service.report()).resolves.toEqual({
            checked: total,
            outOfOrder: total,
        });

        expect(warnSpy).toHaveBeenCalledTimes(
            DUNGEON_ORDER_REPORT_WARNINGS_LIMIT + 1,
        );
        expect(warnSpy).toHaveBeenLastCalledWith(
            `Ordine della dungeon: ${total} dungeon da riordinare su ${total}`,
        );
    });
});
