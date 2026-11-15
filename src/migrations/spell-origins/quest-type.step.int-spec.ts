// UNA TANTUM (Phase 24 D-20): prova sul replica set la rinomina del tipo di quest con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { QuestResultTypeStep, QuestTypeStep } from './quest-type.step';

type RawDocument = Record<string, unknown>;

function rawQuest(type: string): RawDocument {
    return {
        _id: new Types.ObjectId(),
        infos: {
            title: `Quest ${type}`,
            type,
            markerLocation: new Types.ObjectId(),
            enemies: [],
        },
        requirements: { minTitle: 'rookie', requiredAdventurers: [] },
        generated: false,
        concludedAt: null,
    };
}

function rawResult(type: string): RawDocument {
    return {
        _id: new Types.ObjectId(),
        character: new Types.ObjectId(),
        quest: { id: new Types.ObjectId(), type, title: `Quest ${type}` },
        won: true,
        seen: false,
    };
}

describe('QuestTypeStep and QuestResultTypeStep (replSet)', () => {
    let harness: AuthTestApp;
    let questStep: QuestTypeStep;
    let resultStep: QuestResultTypeStep;

    const quests = () => harness.connection.model(Quest.name).collection;
    const results = () => harness.connection.model(QuestResult.name).collection;

    async function insertQuest(type: string): Promise<RawDocument> {
        const quest = rawQuest(type);
        await quests().insertOne(quest);
        return quest;
    }

    async function insertResult(type: string): Promise<RawDocument> {
        const result = rawResult(type);
        await results().insertOne(result);
        return result;
    }

    const byId = (doc: RawDocument) => ({ _id: doc._id as Types.ObjectId });

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: QuestResult.name, schema: QuestResultSchema },
                ]),
            ],
        });
        questStep = new QuestTypeStep(harness.connection);
        resultStep = new QuestResultTypeStep(harness.connection);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('renames the magic type of a quest to arcane and touches nothing else (D-20)', async () => {
        const quest = await insertQuest('magic');

        await questStep.run();

        const infos = quest.infos as RawDocument;
        expect(await quests().findOne(byId(quest))).toEqual({
            ...quest,
            infos: { ...infos, type: 'arcane' },
        });
    });

    it.each([['study'], ['heal'], ['shamanic'], ['void'], ['arcane']])(
        'leaves every other quest type alone (D-20): %s',
        async (type) => {
            const quest = await insertQuest(type);
            const result = await insertResult(type);

            await questStep.run();
            await resultStep.run();

            expect(await quests().findOne(byId(quest))).toEqual(quest);
            expect(await results().findOne(byId(result))).toEqual(result);
        },
    );

    it('renames the type photographed in a quest result (D-20)', async () => {
        const magic = await insertResult('magic');
        const study = await insertResult('study');

        await resultStep.run();

        const snapshot = magic.quest as RawDocument;
        expect(await results().findOne(byId(magic))).toEqual({
            ...magic,
            quest: { ...snapshot, type: 'arcane' },
        });
        expect(await results().findOne(byId(study))).toEqual(study);
    });

    it('reports the quests and the results found, migrated and already arcane (D-20)', async () => {
        await insertQuest('magic');
        await insertQuest('magic');
        await insertQuest('arcane');
        await insertQuest('study');
        await insertResult('magic');
        await insertResult('arcane');
        await insertResult('arcane');
        await insertResult('heal');

        await expect(questStep.run()).resolves.toEqual({
            found: 3,
            migrated: 2,
            alreadyDone: 1,
            unmatched: 0,
        });
        await expect(resultStep.run()).resolves.toEqual({
            found: 3,
            migrated: 1,
            alreadyDone: 2,
            unmatched: 0,
        });
    });

    it('writes nothing on a second run (D-20)', async () => {
        await insertQuest('magic');
        await insertResult('magic');
        await questStep.run();
        await resultStep.run();
        const questsBefore = await quests().find({}).toArray();
        const resultsBefore = await results().find({}).toArray();

        await expect(questStep.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 1,
            unmatched: 0,
        });
        await expect(resultStep.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 1,
            unmatched: 0,
        });
        expect(await quests().find({}).toArray()).toEqual(questsBefore);
        expect(await results().find({}).toArray()).toEqual(resultsBefore);
    });

    it('reports zeros on empty collections (D-20)', async () => {
        const zeros = { found: 0, migrated: 0, alreadyDone: 0, unmatched: 0 };

        await expect(questStep.run()).resolves.toEqual(zeros);
        await expect(resultStep.run()).resolves.toEqual(zeros);
    });

    it('labels the two steps for the boot log (D-20)', () => {
        expect([questStep.label, resultStep.label]).toEqual([
            'tipo delle quest',
            'tipo nei risultati',
        ]);
    });
});
