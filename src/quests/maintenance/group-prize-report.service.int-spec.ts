import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { GROUP_PRIZE_REPORT_WARNINGS_LIMIT } from './group-prize.report';
import { GroupPrizeReportService } from './group-prize-report.service';

describe('GroupPrizeReportService (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let service: GroupPrizeReportService;
    let warnSpy: jest.SpyInstance;

    async function insertQuest(
        type: string,
        seats: { title: string | null; count: number }[],
        concludedAt: Date | null = null,
    ): Promise<Types.ObjectId> {
        const base = buildQuest();
        const { insertedId } = await quests.collection.insertOne({
            ...base,
            infos: { ...base.infos, type },
            requirements: { ...base.requirements, requiredAdventurers: seats },
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
                ]),
            ],
        });
        quests = harness.app.get<Model<QuestDocument>>(
            getModelToken(Quest.name),
        );
        service = new GroupPrizeReportService(quests as never);
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

    it('reports the open group quests and writes nothing (D-24, D-28)', async () => {
        const untitled = [
            { title: 'mage', count: 1 },
            { title: null, count: 1 },
        ];
        const invalid = await insertQuest('boss', untitled);
        await insertQuest(
            'worldMission',
            untitled,
            new Date('2026-11-01T00:00:00Z'),
        );
        await insertQuest('boss', [{ title: 'mage', count: 2 }]);
        const before = await rawQuests();

        await expect(service.report()).resolves.toEqual({
            checked: 2,
            invalid: 1,
        });

        expect(await rawQuests()).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Premi per titolo: missione ${invalid.toHexString()} da correggere (nullSeat)`,
            ],
            ['Premi per titolo: 1 quest di gruppo da correggere su 2'],
        ]);
    });

    it('caps the warnings and closes with the counts (D-24)', async () => {
        const untitled = [{ title: null, count: 2 }];
        for (let i = 0; i <= GROUP_PRIZE_REPORT_WARNINGS_LIMIT; i++)
            await insertQuest('worldMission', untitled);
        const total = GROUP_PRIZE_REPORT_WARNINGS_LIMIT + 1;

        await expect(service.report()).resolves.toEqual({
            checked: total,
            invalid: total,
        });

        expect(warnSpy).toHaveBeenCalledTimes(
            GROUP_PRIZE_REPORT_WARNINGS_LIMIT + 1,
        );
        expect(warnSpy).toHaveBeenLastCalledWith(
            `Premi per titolo: ${total} quest di gruppo da correggere su ${total}`,
        );
    });

    it('stays silent when every open group quest is valid (D-24)', async () => {
        await insertQuest('boss', [{ title: 'mage', count: 2 }]);
        await insertQuest('hunt', [{ title: null, count: 1 }]);

        await expect(service.report()).resolves.toEqual({
            checked: 1,
            invalid: 0,
        });

        expect(warnSpy).not.toHaveBeenCalled();
    });
});
