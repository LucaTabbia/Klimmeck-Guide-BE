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
import { Spell } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import {
    characterTouch,
    primeChangeStream,
} from '../../test/harness/prime-change-stream';
import { persistQuest, persistSpell } from '../../test/fixtures';

const START = new Date('2026-10-21T10:00:00.000Z');
const START_ON_THE_WIRE = '2026-10-21T10:00:00.000Z';

const LANE_FIELDS = 'id startDate waitingTime pointsSpent quest { id }';
const LANES_QUERY = `query Lanes($id: String!) { character(id: $id) { id quests { completedQuests { id } pendingQuest { ${LANE_FIELDS} } activeStoryQuest { ${LANE_FIELDS} } activeWorldMissionQuest { ${LANE_FIELDS} } } } }`;
const INNKEEPER_LANES_QUERY =
    '{ characters { id quests { completedQuests { id } pendingQuest { id quest { id } } activeStoryQuest { id quest { id } } activeWorldMissionQuest { id quest { id } } } } }';
const LEARNING_LANE_FIELDS =
    'id startDate waitingTime learningSpell { id name origin requiredLearnTime minLevelToLearn }';
const LEARNING_LANE_QUERY = `query LearningLane($id: String!) { character(id: $id) { quests { pendingQuest { ${LEARNING_LANE_FIELDS} } } } }`;
const INNKEEPER_LEARNING_QUERY = `{ characters { id quests { pendingQuest { ${LEARNING_LANE_FIELDS} } } } }`;
const LEARNING_SUBSCRIPTION = `subscription OnLearning($id: String!) { characterUpdated(id: $id) { id quests { pendingQuest { ${LEARNING_LANE_FIELDS} } } } }`;
const LEARN_TIME = 1_800_000;
const LANES_SUBSCRIPTION =
    'subscription OnLanes($id: String!) { characterUpdated(id: $id) { id quests { pendingQuest { id pointsSpent quest { id } } activeStoryQuest { id pointsSpent waitingTime quest { id } } } } }';

interface WireLearningSpell {
    id: string;
    name: string;
    origin: string;
    requiredLearnTime: number;
    minLevelToLearn: number;
}

interface WireLane {
    id: string;
    learningSpell?: WireLearningSpell | null;
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
        await primeChangeStream(
            harness,
            'characterUpdated',
            characterTouch(harness),
        );
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

    // la pedina dice cosa sta facendo il personaggio («Cacciando…», FE Phase 21, utente 2026-11-14): serve il tipo della quest in corsia
    it('serves the type of the quest of a lane', async () => {
        const alice = await createAliceWithFullLanes();

        const response = await graphqlRequest(
            harness.app,
            'query Lanes($id: String!) { character(id: $id) { quests { pendingQuest { quest { id infos { type } } } } } }',
            { id: String(alice.character?._id) },
            alice.bearer,
        );

        expect(response.body).toEqual({
            data: {
                character: {
                    quests: {
                        pendingQuest: {
                            quest: {
                                id: seeded.hunt.id,
                                infos: { type: seeded.hunt.infos.type },
                            },
                        },
                    },
                },
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
    describe('learning part on the standard lane', () => {
        const spellFields = async () => {
            const spell = await persistSpell(
                harness.connection.model(Spell.name),
                { requiredLearnTime: LEARN_TIME, minLevelToLearn: 6 },
            );
            return {
                spell,
                wire: {
                    id: String(spell._id),
                    name: spell.name as string,
                    origin: spell.origin as string,
                    requiredLearnTime: LEARN_TIME,
                    minLevelToLearn: 6,
                },
            };
        };

        const learningLane = (learningSpell: Types.ObjectId) =>
            pendingQuests.create({
                startDate: START,
                waitingTime: LEARN_TIME,
                pointsSpent: 0,
                quest: seeded.hunt._id,
                learningSpell,
            });

        async function readLearningLane(player: TestPlayer): Promise<WireBody> {
            const response = await graphqlRequest(
                harness.app,
                LEARNING_LANE_QUERY,
                { id: String(player.character?._id) },
                player.bearer,
            );
            return response.body as WireBody;
        }

        it('serves the spell being learned on the standard lane during the learning part (D-26, D-29)', async () => {
            const { spell, wire } = await spellFields();
            const learning = await learningLane(spell._id as Types.ObjectId);
            const alice = await createAliceWith({
                completedQuests: [],
                pendingQuest: learning._id,
            });

            const body = await readLearningLane(alice);

            expect(body).toEqual({
                data: {
                    character: {
                        quests: {
                            pendingQuest: {
                                id: learning.id,
                                startDate: START_ON_THE_WIRE,
                                waitingTime: LEARN_TIME,
                                learningSpell: wire,
                            },
                        },
                    },
                },
            });
        });

        it.each([
            ['without the field', false],
            ['with the field null', true],
        ])(
            'serves a null learning spell outside the learning part (D-26): %s',
            async (_name, withField) => {
                const written = await pendingQuests.collection.insertOne({
                    startDate: START,
                    waitingTime: 60000,
                    pointsSpent: 0,
                    quest: seeded.hunt._id,
                    ...(withField && { learningSpell: null }),
                });
                const alice = await createAliceWith({
                    completedQuests: [],
                    pendingQuest: written.insertedId,
                });

                const body = await readLearningLane(alice);

                expect(body).toEqual({
                    data: {
                        character: {
                            quests: {
                                pendingQuest: {
                                    id: written.insertedId.toHexString(),
                                    startDate: START_ON_THE_WIRE,
                                    waitingTime: 60000,
                                    learningSpell: null,
                                },
                            },
                        },
                    },
                });
            },
        );

        it('serves a null learning spell when the spell no longer exists (D-26)', async () => {
            const learning = await learningLane(new Types.ObjectId());
            const alice = await createAliceWith({
                completedQuests: [],
                pendingQuest: learning._id,
            });

            const body = await readLearningLane(alice);

            expect(body.errors).toBeUndefined();
            expect(body.data?.character?.quests.pendingQuest).toEqual({
                id: learning.id,
                startDate: START_ON_THE_WIRE,
                waitingTime: LEARN_TIME,
                learningSpell: null,
            });
        });

        it('serves the learning spell to the innkeeper list and in the characterUpdated snapshot (D-29)', async () => {
            const { spell, wire } = await spellFields();
            const learning = await learningLane(spell._id as Types.ObjectId);
            const alice = await createAliceWith({
                completedQuests: [],
                pendingQuest: learning._id,
            });
            const oste = await createPlayer(harness, {
                twitchId: 'twitch-lanes-oste',
                role: RoleType.innkeeper,
                withCharacter: false,
            });

            const response = await graphqlRequest(
                harness.app,
                INNKEEPER_LEARNING_QUERY,
                undefined,
                oste.bearer,
            );
            const body = response.body as WireBody;
            const subscription = openSubscription<LanesUpdatedResult>(
                graphqlWsUrl(harness.port),
                { Authorization: alice.bearer },
                {
                    query: LEARNING_SUBSCRIPTION,
                    variables: { id: String(alice.character?._id) },
                },
            );
            opened.push(subscription);
            const snapshot = await nextLanes(subscription);

            expect(body.errors).toBeUndefined();
            const listed = body.data?.characters?.find(
                (character) => character.id === String(alice.character?._id),
            );
            expect(listed?.quests.pendingQuest?.learningSpell).toEqual(wire);
            expect(snapshot.quests.pendingQuest?.learningSpell).toEqual(wire);
        });
    });
});
