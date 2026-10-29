import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import {
    Character,
    CHARACTER_ACTIVE_TRAVEL_END_INDEX,
    CHARACTER_AWAITING_AID_SINCE_INDEX,
    CHARACTER_SPELL_RECOVERIES_INDEX,
    CHARACTER_STANDARD_LANE_INDEX,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PENDING_QUEST_LANE_DATES_INDEX,
    PendingQuest,
    PendingQuestDocument,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    Quest,
    QUEST_FORMING_PARTIES_INDEX,
    QUEST_REGISTERED_CHARACTER_INDEX,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import {
    User,
    USER_CURRENT_CHARACTER_INDEX,
    UserDocument,
    UserSchema,
} from 'src/models/user.model';
import { SweepIndexVerifier } from 'src/mongo/sweep-index.verifier';

const CharacterModel: Model<CharacterDocument> =
    mongoose.models.Character ||
    mongoose.model(Character.name, CharacterSchema);
const QuestModel: Model<QuestDocument> =
    mongoose.models.Quest || mongoose.model(Quest.name, QuestSchema);
const PendingQuestModel: Model<PendingQuestDocument> =
    mongoose.models.PendingQuest ||
    mongoose.model(PendingQuest.name, PendingQuestSchema);
const UserModel: Model<UserDocument> =
    mongoose.models.User || mongoose.model(User.name, UserSchema);

const MODELS: Model<any>[] = [
    CharacterModel,
    QuestModel,
    PendingQuestModel,
    UserModel,
];

const EXPECTED_INDEXES: Record<string, string[]> = {
    characters: [
        CHARACTER_STANDARD_LANE_INDEX,
        CHARACTER_AWAITING_AID_SINCE_INDEX,
        CHARACTER_ACTIVE_TRAVEL_END_INDEX,
        CHARACTER_SPELL_RECOVERIES_INDEX,
    ],
    quests: [QUEST_FORMING_PARTIES_INDEX, QUEST_REGISTERED_CHARACTER_INDEX],
    pendingquests: [PENDING_QUEST_LANE_DATES_INDEX],
    users: [USER_CURRENT_CHARACTER_INDEX],
};

async function indexNamesOf(model: Model<any>): Promise<string[]> {
    const indexes = await model.collection.listIndexes().toArray();
    return indexes.map(({ name }) => name as string);
}

describe('SweepIndexVerifier (replSet)', () => {
    let verifier: SweepIndexVerifier;
    let errorSpy: jest.SpyInstance;

    beforeAll(async () => {
        await Promise.all(MODELS.map((model) => model.init()));
        const moduleRef = await Test.createTestingModule({
            providers: [
                SweepIndexVerifier,
                {
                    provide: getModelToken(Character.name),
                    useValue: CharacterModel,
                },
                { provide: getModelToken(Quest.name), useValue: QuestModel },
                {
                    provide: getModelToken(PendingQuest.name),
                    useValue: PendingQuestModel,
                },
                { provide: getModelToken(User.name), useValue: UserModel },
            ],
        }).compile();
        verifier = moduleRef.get(SweepIndexVerifier);
    });

    beforeEach(async () => {
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        await Promise.all(
            MODELS.map((model) => model.collection.dropIndexes()),
        );
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(MODELS.map((model) => model.createIndexes()));
    });

    async function bootAndSettle(): Promise<void> {
        const verifyAll = jest.spyOn(verifier, 'verifyAll');

        expect(verifier.onApplicationBootstrap()).toBeUndefined();

        expect(verifyAll).toHaveBeenCalledTimes(1);
        await verifyAll.mock.results[0].value;
    }

    it('builds the sweep indexes at boot (D-17b)', async () => {
        await bootAndSettle();

        for (const model of MODELS) {
            const collection = model.collection.collectionName;
            expect(await indexNamesOf(model)).toEqual(
                expect.arrayContaining(EXPECTED_INDEXES[collection]),
            );
        }
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('never blocks the boot when an index cannot be built (D-17b)', async () => {
        const indexFailure = Object.assign(new Error('not authorized'), {
            name: 'MongoServerError',
            code: 13,
        });
        jest.spyOn(QuestModel, 'createIndexes').mockRejectedValueOnce(
            indexFailure,
        );

        await bootAndSettle();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [message] = errorSpy.mock.calls[0] as [string];
        expect(message).toContain('quests');
        expect(message).toContain('MongoServerError, code 13');
        expect(await indexNamesOf(UserModel)).toEqual(
            expect.arrayContaining(EXPECTED_INDEXES.users),
        );
    });
});
