import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import { User, UserDocument, UserSchema } from 'src/models/user.model';
import { PendingRequestsService } from 'src/quests/pending-requests/pending-requests.service';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    buildCharacter,
    persistCharacter,
    persistQuest,
    persistUser,
} from '../../../test/fixtures';

const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const STARTED_AT = new Date('2026-10-01T10:00:00.000Z');

describe('PendingRequestsService (replSet)', () => {
    let harness: AuthTestApp;
    let service: PendingRequestsService;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuest>;
    let quests: Model<QuestDocument>;
    let users: Model<UserDocument>;

    function modelOf<T>(name: string): Model<T> {
        return harness.app.get<Model<T>>(getModelToken(name));
    }

    // un personaggio con la corsia indicata già scritta, e il suo utente
    async function playerOnLane(
        name: string,
        lane: 'activeStoryQuest' | 'activeWorldMissionQuest' | 'pendingQuest',
        pendingQuestId: Types.ObjectId,
        extra: Record<string, unknown> = {},
    ): Promise<{ character: CharacterDocument; user: UserDocument }> {
        const character = (await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name },
            quests: { completedQuests: [], [lane]: pendingQuestId },
            ...extra,
        })) as CharacterDocument;
        const user = (await persistUser(users, {
            twitchId: `twitch-${name}`,
            currentCharacter: character._id,
        })) as UserDocument;
        return { character, user };
    }

    async function pendingQuestFor(questType: string, title: string) {
        const quest = await persistQuest(quests, {
            infos: {
                title,
                type: questType,
                markerLocation: new Types.ObjectId(),
                relatedLore: [],
            },
        });
        return pendingQuests.create({
            startDate: STARTED_AT,
            waitingTime: 0,
            pointsSpent: 300,
            quest: quest._id,
        });
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                    { name: PendingQuest.name, schema: PendingQuestSchema },
                    { name: Quest.name, schema: QuestSchema },
                    { name: User.name, schema: UserSchema },
                ]),
            ],
            providers: [PendingRequestsService],
        });
        service = harness.app.get(PendingRequestsService);
        characters = modelOf<CharacterDocument>(Character.name);
        pendingQuests = modelOf<PendingQuest>(PendingQuest.name);
        quests = modelOf<QuestDocument>(Quest.name);
        users = modelOf<UserDocument>(User.name);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('lists the GM lanes of active characters only', async () => {
        const storyPq = await pendingQuestFor('story', 'The king');
        const missionPq = await pendingQuestFor('worldMission', 'The siege');
        const archivedPq = await pendingQuestFor('story', 'The old king');
        const standardPq = await pendingQuestFor('hunt', 'Wolves');
        const aria = await playerOnLane(
            'Aria',
            'activeStoryQuest',
            storyPq._id,
        );
        const bram = await playerOnLane(
            'Bram',
            'activeWorldMissionQuest',
            missionPq._id,
        );
        await playerOnLane('Cora', 'activeStoryQuest', archivedPq._id, {
            deletedAt: ARCHIVED_AT,
        });
        await playerOnLane('Dario', 'pendingQuest', standardPq._id);

        const requests = await service.list();

        expect(requests.map((request) => request.id).sort()).toEqual(
            [String(storyPq._id), String(missionPq._id)].sort(),
        );
        const story = requests.find(
            (request) => request.id === String(storyPq._id),
        );
        expect(story).toMatchObject({
            startDate: STARTED_AT,
            pointsSpent: 300,
            quest: { type: 'story', title: 'The king' },
            character: {
                id: String(aria.character._id),
                name: 'Aria',
                title: 'rookie',
                location: (
                    aria.character.status.location as Types.ObjectId
                ).toHexString(),
                activeTravel: null,
                awaitingAid: null,
            },
            user: { id: String(aria.user._id), twitchId: 'twitch-Aria' },
        });
        expect(
            requests.find((request) => request.id === String(missionPq._id))
                ?.character.id,
        ).toBe(String(bram.character._id));
    });

    it('skips a lane pointing to a missing pending quest with a WARN of ids only', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const missingPq = new Types.ObjectId();
        const storyPq = await pendingQuestFor('story', 'The king');
        await playerOnLane('Aria', 'activeStoryQuest', storyPq._id);
        const ghost = await playerOnLane(
            'Ghost',
            'activeStoryQuest',
            missingPq,
        );

        const requests = await service.list();

        expect(requests.map((request) => request.id)).toEqual([
            String(storyPq._id),
        ]);
        const messages = warn.mock.calls.map(([message]) => String(message));
        const skippedWarning = messages.find((message) =>
            message.includes(missingPq.toHexString()),
        );
        expect(skippedWarning).toContain(String(ghost.character._id));
        expect(skippedWarning).not.toContain('Ghost');
        expect(skippedWarning).not.toContain('twitch-');
    });

    it('projects the standard lane of each queued character (D-23)', async () => {
        const ariaStoryPq = await pendingQuestFor('story', 'The king');
        const bramStoryPq = await pendingQuestFor('story', 'The queen');
        const standardPq = await pendingQuestFor('hunt', 'Wolves');
        const aria = await playerOnLane(
            'Aria',
            'activeStoryQuest',
            ariaStoryPq._id,
            {
                quests: {
                    completedQuests: [],
                    activeStoryQuest: ariaStoryPq._id,
                    pendingQuest: standardPq._id,
                },
            },
        );
        const bram = await playerOnLane(
            'Bram',
            'activeStoryQuest',
            bramStoryPq._id,
        );

        const requests = await service.list();

        const laneOf = (characterId: unknown) =>
            requests.find(
                (request) => request.character.id === String(characterId),
            )?.character.pendingQuest;
        expect(laneOf(aria.character._id)).toBe(String(standardPq._id));
        expect(laneOf(bram.character._id)).toBeNull();
    });

    it('keeps a busy character in the queue instead of filtering it (C22)', async () => {
        const storyPq = await pendingQuestFor('story', 'The king');
        const standardPq = await pendingQuestFor('hunt', 'Wolves');
        const aria = await playerOnLane(
            'Aria',
            'activeStoryQuest',
            storyPq._id,
        );
        const freeLaneIds = (await service.list()).map((request) => request.id);

        await characters.updateOne(
            { _id: aria.character._id },
            { $set: { 'quests.pendingQuest': standardPq._id } },
        );
        const busyLaneIds = (await service.list()).map((request) => request.id);

        expect(freeLaneIds).toEqual([String(storyPq._id)]);
        expect(busyLaneIds).toEqual(freeLaneIds);
    });
});
