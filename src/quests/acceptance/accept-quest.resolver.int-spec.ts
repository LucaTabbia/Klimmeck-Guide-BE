import { getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import { AdminAuditLog } from 'src/authz/audit/admin-audit-log.model';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { City, CityDocument } from 'src/models/city.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { LootItem } from 'src/models/loot-item.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { User, UserDocument } from 'src/models/user.model';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { QuestsModule } from 'src/quests/quests.module';
import type { RoadRoute } from 'src/roads/road-route';
import { RoadsService } from 'src/roads/roads.service';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import {
    foodNeededFor,
    hpLostFor,
    uncoveredKmOf,
} from 'src/travel/food/travel-food';
import { TRAVEL_QUEUE } from 'src/travel/travel-job';
import { BASE_SPEED, durationMsOf } from 'src/travel/travel-timing';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    characterTouch,
    primeChangeStream,
} from '../../../test/harness/prime-change-stream';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistPoi,
    persistQuest,
} from '../../../test/fixtures';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    foodStack,
    HARDY_LIFE_POINTS,
    persistFood,
} from '../../../test/travel/travel-food.fixture';
import { persistTravelWorld } from '../../../test/travel/travel-world';

const ACCEPT =
    'mutation Accept($request: AcceptQuestRequest!) { acceptQuest(request: $request) { response successful } }';
const LANES_SUBSCRIPTION =
    'subscription OnLanes($id: String!) { characterUpdated(id: $id) { id quests { pendingQuest { id } activeStoryQuest { id startDate waitingTime pointsSpent quest { id } } } } }';
const TRAVEL_SUBSCRIPTION =
    'subscription OnTravel($id: String!) { characterUpdated(id: $id) { id status { location { id } activeTravel { road { coordinates distance } startTime endTime duration to } } quests { pendingQuest { id startDate waitingTime } } } }';
const QUEST_TRAVEL_PREVIEW_QUERY =
    'query QuestTravel($request: AcceptQuestRequest!) { questTravelPreview(request: $request) { distance duration hpLost arrivesAlive food { quantity item { id name } } } }';
const QUESTS_QUERY =
    'query { quests { id registeredAdventurers { character title } requirements { requiredAdventurers { title count } } } }';
const MISSING_QUEST_ID = '64b0000000000000000000ff';
const MALFORMED_ID = 'abc';
const FORBIDDEN_MESSAGE = 'Questo personaggio non ti appartiene';
const STORY_COST = 5000;
const RICH_BALANCE = 6000;

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WireBody {
    data?: {
        acceptQuest?: { response: string; successful: boolean } | null;
    } | null;
    errors?: WireError[];
}

interface WireQuestTravelPreview {
    distance: number;
    duration: number;
    hpLost: number;
    arrivesAlive: boolean;
    food: { quantity: number; item: { id: string; name: string } }[];
}

interface QuestTravelPreviewBody {
    data?: { questTravelPreview: WireQuestTravelPreview | null } | null;
    errors?: WireError[];
}

interface WireQuest {
    id: string;
    registeredAdventurers: { character: string; title: string }[];
    requirements: {
        requiredAdventurers: { title: string | null; count: number }[];
    };
}

interface QuestsBody {
    data?: { quests: WireQuest[] } | null;
    errors?: WireError[];
}

interface WireLane {
    id: string;
    startDate: string;
    waitingTime: number;
    pointsSpent: number;
    quest: { id: string };
}

interface WireCharacter {
    id: string;
    quests: {
        pendingQuest: { id: string } | null;
        activeStoryQuest: WireLane | null;
    };
}

type LanesUpdatedResult = { characterUpdated: WireCharacter };

interface WireTravelCharacter {
    id: string;
    status: {
        location: { id: string } | null;
        activeTravel: {
            road: { coordinates: number[][]; distance: number };
            startTime: string;
            endTime: string;
            duration: number;
            to: string;
        } | null;
    };
    quests: {
        pendingQuest: {
            id: string;
            startDate: string | null;
            waitingTime: number;
        } | null;
    };
}

type TravelUpdatedResult = { characterUpdated: WireTravelCharacter };

interface World {
    cityMarker: Types.ObjectId;
    questMarker: Types.ObjectId;
}

interface AcceptRequest {
    id: string;
    questId: string;
}

interface Rejection {
    name: string;
    code: string;
    message: string;
    arrange: () => Promise<{ player: TestPlayer; request: AcceptRequest }>;
}

describe('acceptQuest (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let quests: Model<QuestDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let users: Model<UserDocument>;
    let cities: Model<CityDocument>;
    let world: World;
    const opened: OpenSubscription<unknown>[] = [];
    const queue = new FakeTravelQueue();
    const questQueue = new FakeTravelQueue();

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            imports: [QuestAcceptanceModule, QuestsModule],
            // coda del viaggio automatico senza Redis
            overrides: [
                { token: getQueueToken(TRAVEL_QUEUE), useValue: queue },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: questQueue,
                },
                { token: QUEUE_CALL_TIMEOUT, useValue: 50 },
            ],
        });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        quests = harness.connection.model<QuestDocument>(Quest.name);
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        cities = harness.connection.model<CityDocument>(City.name);
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            quests.init(),
            pendingQuests.init(),
            users.init(),
            cities.init(),
        ]);
        await primeChangeStream(
            harness,
            'characterUpdated',
            characterTouch(harness),
        );
    });

    beforeEach(async () => {
        world = await persistWorld();
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
        queue.reset();
        questQueue.reset();
    });

    afterAll(async () => {
        await harness.close();
    });

    // POI reali (un marker senza documento è rifiutato, D-27), lontani dalla rete del travel world: senza strada la corsia standard salta (D-03)
    async function persistWorld(): Promise<World> {
        const pois =
            harness.connection.models[PointOfInterest.name] ??
            harness.connection.model(
                PointOfInterest.name,
                PointOfInterestSchema,
            );
        const cityId = new Types.ObjectId();
        const poiAt = async (
            location: [number, number],
            type: string,
        ): Promise<Types.ObjectId> =>
            (await persistPoi(pois, { location, type, city: cityId }))
                ._id as Types.ObjectId;
        const cityMarker = await poiAt([50, 50], 'city');
        const questMarker = await poiAt([50.02, 50.02], 'dungeon');
        await persistCity(cities, {
            _id: cityId,
            markerLocation: cityMarker,
            pointsOfInterest: [cityMarker, questMarker],
        });
        return { cityMarker, questMarker };
    }

    async function playerWith(
        name: string,
        options: {
            twitchPoints?: number;
            role?: RoleType;
            title?: string;
            location?: Types.ObjectId;
            completedQuests?: Types.ObjectId[];
            activeTravel?: Record<string, unknown>;
            awaitingAid?: Record<string, unknown>;
            lifePoints?: number;
            ownedItems?: unknown[];
        } = {},
    ): Promise<TestPlayer> {
        const base = buildCharacter();
        const player = await createPlayer(harness, {
            twitchId: `twitch-accept-${name}`,
            role: options.role,
            characterOverrides: {
                infos: { ...base.infos, name: `Eroe ${name}` },
                status: {
                    ...base.status,
                    location: options.location ?? world.cityMarker,
                    title: options.title ?? 'rookie',
                    activeTravel: options.activeTravel ?? null,
                    awaitingAid: options.awaitingAid ?? null,
                    currentLifePoints:
                        options.lifePoints ?? base.status.currentLifePoints,
                    maxLifePoints:
                        options.lifePoints ?? base.status.maxLifePoints,
                },
                quests: {
                    completedQuests: options.completedQuests ?? [],
                    pendingQuest: null,
                },
                assets: {
                    ...base.assets,
                    ownedItems: options.ownedItems ?? base.assets.ownedItems,
                },
            },
        });
        await users.updateOne(
            { _id: player.user._id },
            { $set: { twitchPoints: options.twitchPoints ?? RICH_BALANCE } },
        );
        return player;
    }

    async function questOf(
        type: string,
        requirements: Record<string, unknown> = {},
    ): Promise<string> {
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type,
                markerLocation: world.questMarker,
            },
            requirements: { ...base.requirements, ...requirements },
        });
        return String(quest._id);
    }

    async function otherCityMarker(): Promise<Types.ObjectId> {
        const elsewhere = new Types.ObjectId();
        await persistCity(cities, {
            markerLocation: elsewhere,
            pointsOfInterest: [elsewhere],
        });
        return elsewhere;
    }

    function activeTravel(): Record<string, unknown> {
        const startTime = new Date();
        return {
            road: {
                coordinates: [
                    [0, 0],
                    [0, 0.2],
                ],
                distance: 0.44,
            },
            startTime,
            endTime: new Date(startTime.getTime() + 3_600_000),
            duration: 3_600_000,
            to: new Types.ObjectId(),
            kind: 'free',
        };
    }

    function storyOf(minTitle = 'rookie'): Promise<string> {
        return questOf('story', { requiredPoints: STORY_COST, minTitle });
    }

    function characterIdOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    async function accept(
        request: AcceptRequest,
        bearer?: string,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            ACCEPT,
            { request },
            bearer,
        );
        return response.body as WireBody;
    }

    function rawCharacter(player: TestPlayer) {
        return characters.collection.findOne({
            _id: player.character?._id as Types.ObjectId,
        });
    }

    async function pointsOf(player: TestPlayer): Promise<number> {
        const user = await users.collection.findOne({
            _id: player.user._id as Types.ObjectId,
        });
        return user?.twitchPoints as number;
    }

    function expectRejected(body: WireBody, code: string, message: string) {
        expect(body.data ?? null).toBeNull();
        expect(body.errors?.[0]?.extensions).toEqual({ code });
        expect(body.errors?.[0]?.message).toBe(message);
    }

    function subscribeToLanes(
        player: TestPlayer,
    ): OpenSubscription<LanesUpdatedResult> {
        const subscription = openSubscription<LanesUpdatedResult>(
            graphqlWsUrl(harness.port),
            { Authorization: player.bearer },
            {
                query: LANES_SUBSCRIPTION,
                variables: { id: characterIdOf(player) },
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

    it('accepts a story for the owner and moves the points', async () => {
        const alice = await playerWith('alice');
        const storyId = await storyOf();

        const body = await accept(
            { id: characterIdOf(alice), questId: storyId },
            alice.bearer,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.acceptQuest).toEqual({
            response: 'Missione accettata',
            successful: true,
        });
        expect((await rawCharacter(alice))?.quests.activeStoryQuest).toEqual(
            expect.any(Types.ObjectId),
        );
        expect(await pointsOf(alice)).toBe(RICH_BALANCE - STORY_COST);
    });

    const REJECTIONS: Rejection[] = [
        {
            name: 'a second story while one is active',
            code: 'QUEST_SLOT_BUSY',
            message: 'Hai già una missione in corso',
            arrange: async () => {
                const player = await playerWith('busy', {
                    twitchPoints: 2 * STORY_COST,
                });
                const firstId = await storyOf();
                const first = await accept(
                    { id: characterIdOf(player), questId: firstId },
                    player.bearer,
                );
                expect(first.errors).toBeUndefined();
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await storyOf(),
                    },
                };
            },
        },
        {
            name: 'a story above the character title',
            code: 'QUEST_TITLE_MISMATCH',
            message: 'Il tuo titolo non permette questa missione',
            arrange: async () => {
                const player = await playerWith('rookie');
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await storyOf('adventurer'),
                    },
                };
            },
        },
        {
            name: 'a character in another city',
            code: 'QUEST_NOT_IN_CITY',
            message: 'Devi trovarti nella città della missione',
            arrange: async () => {
                const player = await playerWith('elsewhere', {
                    location: await otherCityMarker(),
                });
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await questOf('hunt'),
                    },
                };
            },
        },
        {
            name: 'a character awaiting aid, even travelling',
            code: 'AWAITING_AID',
            message: 'Il tuo personaggio è in attesa di soccorso',
            arrange: async () => {
                const player = await playerWith('wounded', {
                    activeTravel: activeTravel(),
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: new Types.ObjectId(),
                        since: new Date(),
                    },
                });
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await questOf('hunt'),
                    },
                };
            },
        },
        {
            name: 'a travelling character',
            code: 'TRAVEL_IN_PROGRESS',
            message: 'Sei già in viaggio',
            arrange: async () => {
                const player = await playerWith('traveller', {
                    activeTravel: activeTravel(),
                });
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await questOf('hunt'),
                    },
                };
            },
        },
        {
            name: 'an enemy without rank slots',
            code: 'QUEST_NOT_ACCEPTABLE',
            message: 'Missione non disponibile',
            arrange: async () => {
                const player = await playerWith('slotless');
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await questOf('enemy', {
                            requiredAdventurers: [],
                        }),
                    },
                };
            },
        },
        {
            name: 'a story without a points cost',
            code: 'QUEST_NOT_ACCEPTABLE',
            message: 'Missione non disponibile',
            arrange: async () => {
                const player = await playerWith('uncosted');
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await questOf('story', {
                            requiredPoints: null,
                            minTitle: 'rookie',
                        }),
                    },
                };
            },
        },
        {
            name: 'a balance below the story cost',
            code: 'INSUFFICIENT_POINTS',
            message: 'Punti canale insufficienti',
            arrange: async () => {
                const player = await playerWith('poor', { twitchPoints: 100 });
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await storyOf(),
                    },
                };
            },
        },
        {
            name: 'a story already completed',
            code: 'QUEST_ALREADY_TAKEN',
            message: 'Hai già affrontato questa missione',
            arrange: async () => {
                const storyId = await storyOf();
                const player = await playerWith('veteran', {
                    completedQuests: [new Types.ObjectId(storyId)],
                });
                return {
                    player,
                    request: { id: characterIdOf(player), questId: storyId },
                };
            },
        },
        {
            name: 'a world mission without a slot for the rank',
            code: 'QUEST_FULL',
            message: 'Non ci sono più posti per il tuo rango',
            arrange: async () => {
                const player = await playerWith('outranked');
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: await questOf('worldMission', {
                            requiredPoints: 3000,
                            requiredAdventurers: [{ title: 'hero', count: 1 }],
                        }),
                    },
                };
            },
        },
        {
            name: 'a missing quest',
            code: 'NOT_FOUND',
            message: 'Missione non trovata',
            arrange: async () => {
                const player = await playerWith('missing');
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: MISSING_QUEST_ID,
                    },
                };
            },
        },
        {
            name: 'a malformed quest id',
            code: 'BAD_USER_INPUT',
            message: 'Input non valido: questId',
            arrange: async () => {
                const player = await playerWith('malformed-quest');
                return {
                    player,
                    request: {
                        id: characterIdOf(player),
                        questId: MALFORMED_ID,
                    },
                };
            },
        },
        {
            name: 'a malformed character id',
            code: 'BAD_USER_INPUT',
            message: 'Input non valido: id',
            arrange: async () => {
                const player = await playerWith('malformed-character');
                return {
                    player,
                    request: { id: MALFORMED_ID, questId: await storyOf() },
                };
            },
        },
    ];

    it.each(REJECTIONS)(
        'rejects $name with $code',
        async ({ code, message, arrange }) => {
            const { player, request } = await arrange();

            const body = await accept(request, player.bearer);

            expectRejected(body, code, message);
        },
    );

    it('accepts a story from another city on the wire', async () => {
        const wanderer = await playerWith('wanderer', {
            location: await otherCityMarker(),
        });
        const storyId = await storyOf();

        const body = await accept(
            { id: characterIdOf(wanderer), questId: storyId },
            wanderer.bearer,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.acceptQuest).toEqual({
            response: 'Missione accettata',
            successful: true,
        });
    });

    it('rejects a world mission from another city on the wire', async () => {
        const p = await playerWith('wandering-hero', {
            location: await otherCityMarker(),
        });
        const questId = await questOf('worldMission', {
            requiredPoints: 3000,
            requiredAdventurers: [{ title: null, count: 3 }],
        });

        const body = await accept({ id: characterIdOf(p), questId }, p.bearer);

        expectRejected(
            body,
            'QUEST_NOT_IN_CITY',
            'Devi trovarti nella città della missione',
        );
        expect(await pointsOf(p)).toBe(RICH_BALANCE);
    });

    it('exposes the registered adventurers and the rank slots on quests', async () => {
        const first = await playerWith('first');
        const second = await playerWith('second');
        const enemyId = await questOf('enemy', {
            requiredAdventurers: [{ title: null, count: 1 }],
        });

        const accepted = await accept(
            { id: characterIdOf(first), questId: enemyId },
            first.bearer,
        );
        expect(accepted.errors).toBeUndefined();

        const response = await graphqlRequest(
            harness.app,
            QUESTS_QUERY,
            {},
            first.bearer,
        );
        const body = response.body as QuestsBody;
        expect(body.errors).toBeUndefined();
        const enemy = body.data?.quests.find((quest) => quest.id === enemyId);
        expect(enemy?.registeredAdventurers).toEqual([
            { character: characterIdOf(first), title: 'rookie' },
        ]);
        expect(enemy?.requirements.requiredAdventurers).toEqual([
            { title: null, count: 1 },
        ]);

        const full = await accept(
            { id: characterIdOf(second), questId: enemyId },
            second.bearer,
        );
        expectRejected(
            full,
            'QUEST_FULL',
            'Non ci sono più posti per il tuo rango',
        );
    });

    it('forbids the innkeeper on a foreign character and writes nothing', async () => {
        const alice = await playerWith('alice');
        const oste = await playerWith('oste', { role: RoleType.innkeeper });
        const storyId = await storyOf();

        const body = await accept(
            { id: characterIdOf(alice), questId: storyId },
            oste.bearer,
        );

        expectRejected(body, 'FORBIDDEN', FORBIDDEN_MESSAGE);
        expect(
            (await rawCharacter(alice))?.quests.activeStoryQuest ?? null,
        ).toBeNull();
        expect(await pendingQuests.countDocuments()).toBe(0);
        expect(await pointsOf(alice)).toBe(RICH_BALANCE);
        expect(await pointsOf(oste)).toBe(RICH_BALANCE);
        expect(
            await harness.connection.model(AdminAuditLog.name).countDocuments(),
        ).toBe(0);
    });

    it('lets the innkeeper accept for its own character', async () => {
        const oste = await playerWith('oste', { role: RoleType.innkeeper });
        const storyId = await storyOf();

        const body = await accept(
            { id: characterIdOf(oste), questId: storyId },
            oste.bearer,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.acceptQuest?.successful).toBe(true);
    });

    it('forbids an adventurer on a foreign character', async () => {
        const alice = await playerWith('alice');
        const bob = await playerWith('bob');
        const storyId = await storyOf();

        const body = await accept(
            { id: characterIdOf(alice), questId: storyId },
            bob.bearer,
        );

        expectRejected(body, 'FORBIDDEN', FORBIDDEN_MESSAGE);
        expect(await pendingQuests.countDocuments()).toBe(0);
    });

    it('stays unauthenticated without a bearer', async () => {
        const alice = await playerWith('alice');
        const storyId = await storyOf();

        const body = await accept({
            id: characterIdOf(alice),
            questId: storyId,
        });

        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'UNAUTHENTICATED',
        });
        expect(await pendingQuests.countDocuments()).toBe(0);
    });

    it('emits the populated lane on characterUpdated after acceptQuest', async () => {
        const alice = await playerWith('alice');
        const storyId = await storyOf();
        const subscription = subscribeToLanes(alice);
        const snapshot = await nextLanes(subscription);
        expect(snapshot.quests.activeStoryQuest).toBeNull();
        const t0 = new Date();

        const body = await accept(
            { id: characterIdOf(alice), questId: storyId },
            alice.bearer,
        );
        expect(body.errors).toBeUndefined();

        const changed = await nextLanes(subscription);
        const lane = (await rawCharacter(alice))?.quests
            .activeStoryQuest as Types.ObjectId;
        expect(changed.quests.pendingQuest).toBeNull();
        expect(changed.quests.activeStoryQuest).toEqual({
            id: lane.toHexString(),
            startDate: expect.any(String) as string,
            waitingTime: 0,
            pointsSpent: STORY_COST,
            quest: { id: storyId },
        });
        const startDate = new Date(
            changed.quests.activeStoryQuest?.startDate as string,
        );
        expect(startDate.toISOString()).toBe(
            changed.quests.activeStoryQuest?.startDate,
        );
        expect(startDate.getTime()).toBeGreaterThanOrEqual(t0.getTime());
        expect(startDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('streams the automatic travel and a null startDate on characterUpdated', async () => {
        const travel = await persistTravelWorld(
            harness.connection,
            harness.app.get(RoadsService),
        );
        const alice = await playerWith('traveller', {
            location: travel.markerA,
        });
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type: 'hunt',
                markerLocation: travel.questPoi,
                timeToComplete: 60000,
            },
            requirements: base.requirements,
        });
        const subscription = openSubscription<TravelUpdatedResult>(
            graphqlWsUrl(harness.port),
            { Authorization: alice.bearer },
            {
                query: TRAVEL_SUBSCRIPTION,
                variables: { id: characterIdOf(alice) },
            },
        );
        opened.push(subscription);
        const first = await subscription.next();
        expect(first.done).toBe(false);

        const body = await accept(
            { id: characterIdOf(alice), questId: String(quest._id) },
            alice.bearer,
        );
        expect(body.errors).toBeUndefined();

        let changed: WireTravelCharacter | undefined;
        while (!changed?.quests.pendingQuest) {
            const result = await subscription.next();
            if (result.done) throw new Error('subscription ended');
            expect(result.value.errors).toBeUndefined();
            changed = result.value.data?.characterUpdated;
        }
        const wire = changed.status.activeTravel;
        expect(wire?.to).toBe(travel.questPoi.toHexString());
        expect(wire?.road.coordinates[0]).toEqual([0, 0]);
        expect(wire?.road.coordinates.at(-1)).toEqual([0.1, 0]);
        expect(wire?.duration).toBe(
            Date.parse(wire?.endTime as string) -
                Date.parse(wire?.startTime as string),
        );
        expect(changed.quests.pendingQuest).toMatchObject({
            startDate: null,
            waitingTime: 60000,
        });
        expect(changed.status.location?.id).toBe(travel.markerA.toHexString());
        expect(queue.added).toHaveLength(1);
    });

    it('answers acceptQuest even when the travel queue hangs (UAT 2026-10-22)', async () => {
        const travel = await persistTravelWorld(
            harness.connection,
            harness.app.get(RoadsService),
        );
        const alice = await playerWith('traveller', {
            location: travel.markerA,
        });
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type: 'hunt',
                markerLocation: travel.questPoi,
                timeToComplete: 60000,
            },
            requirements: base.requirements,
        });
        queue.hangAdd = true;

        const body = await accept(
            { id: characterIdOf(alice), questId: String(quest._id) },
            alice.bearer,
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.acceptQuest).toEqual({
            response: 'Missione accettata',
            successful: true,
        });
        expect(queue.added).toEqual([]);
        const raw = await rawCharacter(alice);
        expect(raw?.status.activeTravel).not.toBeNull();
        expect(raw?.quests.pendingQuest).not.toBeNull();
        const pending = await pendingQuests.collection.findOne({
            _id: raw?.quests.pendingQuest,
        });
        expect(pending?.startDate).toBeNull();
    });
    it('rejects a starving acceptance on the wire with the hunger message (D-11)', async () => {
        const travel = await persistTravelWorld(
            harness.connection,
            harness.app.get(RoadsService),
        );
        const carol = await playerWith('starving-wire', {
            location: travel.markerA,
            lifePoints: 1,
        });
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type: 'hunt',
                markerLocation: travel.questPoi,
                timeToComplete: 60000,
            },
            requirements: base.requirements,
        });
        const before = await rawCharacter(carol);

        const body = await accept(
            { id: characterIdOf(carol), questId: String(quest._id) },
            carol.bearer,
        );

        expectRejected(
            body,
            'TRAVEL_STARVING',
            'Non hai cibo a sufficienza per il viaggio',
        );
        expect(await rawCharacter(carol)).toEqual(before);
        expect(await pendingQuests.countDocuments()).toBe(0);
        expect(await pointsOf(carol)).toBe(RICH_BALANCE);
        expect(queue.added).toEqual([]);
    });

    describe('questTravelPreview (wire)', () => {
        async function previewQuestTravel(
            request: AcceptRequest,
            bearer?: string,
        ): Promise<QuestTravelPreviewBody> {
            const response = await graphqlRequest(
                harness.app,
                QUEST_TRAVEL_PREVIEW_QUERY,
                { request },
                bearer,
            );
            return response.body as QuestTravelPreviewBody;
        }

        async function questAt(
            type: string,
            markerLocation: Types.ObjectId,
        ): Promise<string> {
            const base = buildQuest();
            const quest = await persistQuest(quests, {
                infos: { ...base.infos, type, markerLocation },
                requirements: base.requirements,
            });
            return String(quest._id);
        }

        function travelWorld() {
            return persistTravelWorld(
                harness.connection,
                harness.app.get(RoadsService),
            );
        }

        // query nullable: un rifiuto azzera solo il campo, data resta un oggetto
        function expectPreviewRejected(
            body: QuestTravelPreviewBody,
            code: string,
            message: string,
        ) {
            expect(body.data?.questTravelPreview ?? null).toBeNull();
            expect(body.errors?.[0]?.extensions).toEqual({ code });
            expect(body.errors?.[0]?.message).toBe(message);
        }

        function previewOf(
            body: QuestTravelPreviewBody,
        ): WireQuestTravelPreview | null | undefined {
            expect(body.errors).toBeUndefined();
            return body.data?.questTravelPreview;
        }

        it('previews the automatic travel of a standard quest with its food (D-08, D-09)', async () => {
            const travel = await travelWorld();
            const food20 = await persistFood(
                harness.connection.model(LootItem.name),
                20,
            );
            const alice = await playerWith('provisioned', {
                location: travel.markerA,
                lifePoints: HARDY_LIFE_POINTS,
                ownedItems: [foodStack(food20, 2)],
            });
            const questId = await questAt('hunt', travel.questPoi);
            const characterBefore = await rawCharacter(alice);
            const questBefore = await quests.collection.findOne({
                _id: new Types.ObjectId(questId),
            });

            const wire = previewOf(
                await previewQuestTravel(
                    { id: characterIdOf(alice), questId },
                    alice.bearer,
                ),
            ) as WireQuestTravelPreview;

            const route = harness.app
                .get(RoadsService)
                .routeBetween([0, 0], [0.1, 0]) as RoadRoute;
            const needed = foodNeededFor(wire.duration);
            expect(wire.duration).toBe(
                durationMsOf(route.baseHours, BASE_SPEED),
            );
            expect(wire.distance).toBe(route.distanceKm);
            expect(needed).toBeGreaterThan(0);
            expect(needed).toBeLessThanOrEqual(20);
            expect(wire.food).toEqual([
                {
                    quantity: 1,
                    item: { id: String(food20._id), name: 'Cibo 20' },
                },
            ]);
            expect(wire.hpLost).toBe(
                hpLostFor(uncoveredKmOf(needed, 20, wire.distance)),
            );
            expect(wire.arrivesAlive).toBe(true);
            expect(await rawCharacter(alice)).toEqual(characterBefore);
            expect(
                await quests.collection.findOne({
                    _id: new Types.ObjectId(questId),
                }),
            ).toEqual(questBefore);
            expect(await pendingQuests.countDocuments()).toBe(0);
            expect(await pointsOf(alice)).toBe(RICH_BALANCE);
            expect(queue.added).toEqual([]);
        });

        it('previews a starving quest travel with arrivesAlive false and no error (D-09)', async () => {
            const travel = await travelWorld();
            const bob = await playerWith('starving', {
                location: travel.markerA,
                lifePoints: 1,
            });
            const questId = await questAt('hunt', travel.questPoi);

            const wire = previewOf(
                await previewQuestTravel(
                    { id: characterIdOf(bob), questId },
                    bob.bearer,
                ),
            ) as WireQuestTravelPreview;

            expect(wire.food).toEqual([]);
            expect(wire.hpLost).toBeGreaterThan(0);
            expect(wire.hpLost).toBe(
                hpLostFor(
                    uncoveredKmOf(
                        foodNeededFor(wire.duration),
                        0,
                        wire.distance,
                    ),
                ),
            );
            expect(wire.arrivesAlive).toBe(false);
        });

        it('answers null when the marker is the position of the character (D-08)', async () => {
            const travel = await travelWorld();
            const alice = await playerWith('arrived', {
                location: travel.questPoi,
            });
            const questId = await questAt('hunt', travel.questPoi);

            const body = await previewQuestTravel(
                { id: characterIdOf(alice), questId },
                alice.bearer,
            );

            expect(previewOf(body)).toBeNull();
        });

        it('answers null for an instant jump without warning (D-08)', async () => {
            const warn = jest.spyOn(Logger.prototype, 'warn');
            try {
                const alice = await playerWith('jumper');
                const questId = await questOf('hunt');

                const body = await previewQuestTravel(
                    { id: characterIdOf(alice), questId },
                    alice.bearer,
                );

                expect(previewOf(body)).toBeNull();
                const jumpWarnings = () =>
                    warn.mock.calls.filter(([message]) =>
                        String(message).includes('salto istantaneo'),
                    );
                expect(jumpWarnings()).toEqual([]);
                // controllo positivo: la spia vede il WARN del salto dell'accettazione
                const accepted = await accept(
                    { id: characterIdOf(alice), questId },
                    alice.bearer,
                );
                expect(accepted.errors).toBeUndefined();
                expect(jumpWarnings()).toHaveLength(1);
            } finally {
                warn.mockRestore();
            }
        });

        it('answers null for story and world mission quests (D-08)', async () => {
            const alice = await playerWith('lanes');
            const storyId = await storyOf();
            const worldMissionId = await questOf('worldMission', {
                requiredPoints: 3000,
            });

            const story = await previewQuestTravel(
                { id: characterIdOf(alice), questId: storyId },
                alice.bearer,
            );
            const worldMission = await previewQuestTravel(
                { id: characterIdOf(alice), questId: worldMissionId },
                alice.bearer,
            );

            expect(previewOf(story)).toBeNull();
            expect(previewOf(worldMission)).toBeNull();
        });

        it('rejects a quest of another city with QUEST_NOT_IN_CITY (D-08)', async () => {
            const alice = await playerWith('elsewhere', {
                location: await otherCityMarker(),
            });
            const questId = await questOf('hunt');

            const body = await previewQuestTravel(
                { id: characterIdOf(alice), questId },
                alice.bearer,
            );

            expectPreviewRejected(
                body,
                'QUEST_NOT_IN_CITY',
                'Devi trovarti nella città della missione',
            );
        });

        it('answers NOT_FOUND for a missing quest (D-08)', async () => {
            const alice = await playerWith('missing');

            const body = await previewQuestTravel(
                { id: characterIdOf(alice), questId: MISSING_QUEST_ID },
                alice.bearer,
            );

            expectPreviewRejected(body, 'NOT_FOUND', 'Missione non trovata');
        });

        it('inherits QUEST_NOT_ACCEPTABLE for a marker without a point of interest (D-08)', async () => {
            const ghost = new Types.ObjectId();
            await cities.updateOne(
                { markerLocation: world.cityMarker },
                { $push: { pointsOfInterest: ghost } },
            );
            const alice = await playerWith('ghost');
            const questId = await questAt('hunt', ghost);

            const body = await previewQuestTravel(
                { id: characterIdOf(alice), questId },
                alice.bearer,
            );

            expectPreviewRejected(
                body,
                'QUEST_NOT_ACCEPTABLE',
                'Missione non disponibile',
            );
        });

        it('forbids the innkeeper and another adventurer on a foreign character (D-08)', async () => {
            const alice = await playerWith('alice');
            const oste = await playerWith('oste', {
                role: RoleType.innkeeper,
            });
            const bob = await playerWith('bob');
            const request = {
                id: characterIdOf(alice),
                questId: await questOf('hunt'),
            };

            expectPreviewRejected(
                await previewQuestTravel(request, oste.bearer),
                'FORBIDDEN',
                FORBIDDEN_MESSAGE,
            );
            expectPreviewRejected(
                await previewQuestTravel(request, bob.bearer),
                'FORBIDDEN',
                FORBIDDEN_MESSAGE,
            );
        });

        it('answers BAD_USER_INPUT for malformed ids (D-08)', async () => {
            const alice = await playerWith('malformed');
            const questId = await questOf('hunt');

            expectPreviewRejected(
                await previewQuestTravel(
                    { id: MALFORMED_ID, questId },
                    alice.bearer,
                ),
                'BAD_USER_INPUT',
                'Input non valido: id',
            );
            expectPreviewRejected(
                await previewQuestTravel(
                    { id: characterIdOf(alice), questId: MALFORMED_ID },
                    alice.bearer,
                ),
                'BAD_USER_INPUT',
                'Input non valido: questId',
            );
        });
    });
});
