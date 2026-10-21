import { Types, type Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { primeCharactersChangeStream } from '../../test/characters/characters-change-stream';
import { persistQuest } from '../../test/fixtures';

const START = new Date('2026-10-21T10:00:00.000Z');
const START_ON_THE_WIRE = '2026-10-21T10:00:00.000Z';

const LANE_FIELDS = 'id startDate waitingTime pointsSpent quest { id }';
const LANES_QUERY = `query Lanes($id: String!) { character(id: $id) { id quests { completedQuests { id } pendingQuest { ${LANE_FIELDS} } activeStoryQuest { ${LANE_FIELDS} } activeWorldMissionQuest { ${LANE_FIELDS} } } } }`;
const INNKEEPER_LANES_QUERY =
    '{ characters { id quests { completedQuests { id } pendingQuest { id quest { id } } activeStoryQuest { id quest { id } } activeWorldMissionQuest { id quest { id } } } } }';
const LANES_SUBSCRIPTION =
    'subscription OnLanes($id: String!) { characterUpdated(id: $id) { id quests { pendingQuest { id pointsSpent quest { id } } activeStoryQuest { id pointsSpent waitingTime quest { id } } } } }';

interface WireLane {
    id: string;
    startDate?: string;
    waitingTime?: number;
    pointsSpent?: number;
    quest: { id: string };
}

interface WireQuests {
    completedQuests?: { id: string }[];
    pendingQuest: WireLane | null;
    activeStoryQuest: WireLane | null;
    activeWorldMissionQuest?: WireLane | null;
}

interface WireCharacter {
    id: string;
    quests: WireQuests;
}

interface WireBody {
    data?: {
        character?: WireCharacter | null;
        characters?: WireCharacter[] | null;
    } | null;
    errors?: { message: string }[];
}

type LanesUpdatedResult = { characterUpdated: WireCharacter };

interface SeededQuests {
    hunt: QuestDocument;
    story: QuestDocument;
    world: QuestDocument;
    done: QuestDocument;
}

interface SeededLanes {
    pq1: PendingQuestDocument;
    pq2: PendingQuestDocument;
    pq3: PendingQuestDocument;
}

describe('Character quest lanes (wire)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let characters: Model<CharacterDocument>;
    const opened: OpenSubscription<LanesUpdatedResult>[] = [];

    let seeded: SeededQuests;
    let lanes: SeededLanes;

    async function seedQuests(): Promise<SeededQuests> {
        return {
            hunt: await persistQuest(quests),
            story: await persistQuest(quests),
            world: await persistQuest(quests),
            done: await persistQuest(quests),
        };
    }

    async function seedLanes(): Promise<SeededLanes> {
        return {
            pq1: await pendingQuests.create({
                startDate: START,
                waitingTime: 60000,
                pointsSpent: 0,
                quest: seeded.hunt._id,
            }),
            pq2: await pendingQuests.create({
                startDate: START,
                waitingTime: 0,
                pointsSpent: 5000,
                quest: seeded.story._id,
            }),
            pq3: await pendingQuests.create({
                startDate: START,
                waitingTime: 0,
                pointsSpent: 3000,
                quest: seeded.world._id,
            }),
        };
    }

    function createAliceWith(
        characterQuests: Record<string, unknown>,
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId: 'twitch-lanes-alice',
            characterOverrides: { quests: characterQuests },
        });
    }

    function createAliceWithFullLanes(): Promise<TestPlayer> {
        return createAliceWith({
            completedQuests: [seeded.done._id],
            pendingQuest: lanes.pq1._id,
            activeStoryQuest: lanes.pq2._id,
            activeWorldMissionQuest: lanes.pq3._id,
        });
    }

    async function readLanes(player: TestPlayer): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            LANES_QUERY,
            { id: String(player.character?._id) },
            player.bearer,
        );
        return response.body as WireBody;
    }

    function subscribeToLanes(
        player: TestPlayer,
    ): OpenSubscription<LanesUpdatedResult> {
        const subscription = openSubscription<LanesUpdatedResult>(
            graphqlWsUrl(harness.port),
            { Authorization: player.bearer },
            {
                query: LANES_SUBSCRIPTION,
                variables: { id: String(player.character?._id) },
            },
        );
        opened.push(subscription);
        return subscription;
    }

    async function nextLanes(
        subscription: OpenSubscription<LanesUpdatedResult>,
    ): Promise<WireCharacter> {
        const result = await subscription.next();
        if (result.done) throw new Error('subscription ended');
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.characterUpdated as WireCharacter;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        quests = harness.connection.model<QuestDocument>(Quest.name);
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        await primeCharactersChangeStream(harness);
    });

    beforeEach(async () => {
        seeded = await seedQuests();
        lanes = await seedLanes();
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('resolves the three lanes and the completed quests for the owner', async () => {
        const alice = await createAliceWithFullLanes();

        const body = await readLanes(alice);

        expect(body.errors).toBeUndefined();
        expect(body.data?.character?.quests).toEqual({
            completedQuests: [{ id: seeded.done.id }],
            pendingQuest: {
                id: lanes.pq1.id,
                startDate: START_ON_THE_WIRE,
                waitingTime: 60000,
                pointsSpent: 0,
                quest: { id: seeded.hunt.id },
            },
            activeStoryQuest: {
                id: lanes.pq2.id,
                startDate: START_ON_THE_WIRE,
                waitingTime: 0,
                pointsSpent: 5000,
                quest: { id: seeded.story.id },
            },
            activeWorldMissionQuest: {
                id: lanes.pq3.id,
                startDate: START_ON_THE_WIRE,
                waitingTime: 0,
                pointsSpent: 3000,
                quest: { id: seeded.world.id },
            },
        });
    });

    it('turns a dangling lane into null and drops a dangling completed quest without errors', async () => {
        const alice = await createAliceWith({
            completedQuests: [new Types.ObjectId(), seeded.done._id],
            pendingQuest: null,
            activeStoryQuest: new Types.ObjectId(),
            activeWorldMissionQuest: null,
        });

        const body = await readLanes(alice);

        expect(body.errors).toBeUndefined();
        expect(body.data?.character?.quests.activeStoryQuest).toBeNull();
        expect(body.data?.character?.quests.completedQuests).toEqual([
            { id: seeded.done.id },
        ]);
    });

    it('reads pointsSpent 0 on a legacy pending quest without the field', async () => {
        const legacy = await pendingQuests.collection.insertOne({
            startDate: START,
            waitingTime: 60000,
            quest: seeded.hunt._id,
        });
        const alice = await createAliceWith({
            completedQuests: [],
            pendingQuest: legacy.insertedId,
        });

        const body = await readLanes(alice);

        expect(body.errors).toBeUndefined();
        expect(body.data?.character?.quests.pendingQuest).toEqual({
            id: legacy.insertedId.toHexString(),
            startDate: START_ON_THE_WIRE,
            waitingTime: 60000,
            pointsSpent: 0,
            quest: { id: seeded.hunt.id },
        });
    });

    it('lists the populated lanes to the innkeeper', async () => {
        const alice = await createAliceWithFullLanes();
        const oste = await createPlayer(harness, {
            twitchId: 'twitch-lanes-oste',
            role: RoleType.innkeeper,
            withCharacter: false,
        });

        const response = await graphqlRequest(
            harness.app,
            INNKEEPER_LANES_QUERY,
            undefined,
            oste.bearer,
        );
        const body = response.body as WireBody;

        expect(body.errors).toBeUndefined();
        const listed = body.data?.characters?.find(
            (character) => character.id === String(alice.character?._id),
        );
        expect(listed?.quests).toEqual({
            completedQuests: [{ id: seeded.done.id }],
            pendingQuest: { id: lanes.pq1.id, quest: { id: seeded.hunt.id } },
            activeStoryQuest: {
                id: lanes.pq2.id,
                quest: { id: seeded.story.id },
            },
            activeWorldMissionQuest: {
                id: lanes.pq3.id,
                quest: { id: seeded.world.id },
            },
        });
    });

    it('sends the lanes in the characterUpdated snapshot and in the change events', async () => {
        const alice = await createAliceWith({
            completedQuests: [],
            pendingQuest: lanes.pq1._id,
        });
        const subscription = subscribeToLanes(alice);

        const snapshot = await nextLanes(subscription);
        expect(snapshot.quests.pendingQuest?.id).toBe(lanes.pq1.id);
        expect(snapshot.quests.activeStoryQuest).toBeNull();

        await characters.updateOne(
            { _id: alice.character?._id },
            { $set: { 'quests.activeStoryQuest': lanes.pq2._id } },
        );

        const changed = await nextLanes(subscription);
        expect(changed.quests.activeStoryQuest).toEqual({
            id: lanes.pq2.id,
            pointsSpent: 5000,
            waitingTime: 0,
            quest: { id: seeded.story.id },
        });
    });
});
