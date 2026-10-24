import { getQueueToken } from '@nestjs/bull';
import { Types, type Model } from 'mongoose';
import { AdminAuditLog } from 'src/authz/audit/admin-audit-log.model';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
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
import { User, UserDocument } from 'src/models/user.model';
import { PushDevice } from 'src/push/push-device.model';
import { travelEnd } from 'src/push/push-events';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushService } from 'src/push/push.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { RoadsService } from 'src/roads/roads.service';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { TRAVEL_QUEUE } from './travel-job';
import { TravelSweeper } from './travel-sweeper';
import { TravelModule } from './travel.module';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { primeCharactersChangeStream } from '../../test/characters/characters-change-stream';
import { buildCharacter, buildQuest, persistQuest } from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { FakeTravelQueue } from '../../test/travel/fake-travel-queue';
import {
    persistTravelWorld,
    TravelWorld,
} from '../../test/travel/travel-world';

const START =
    'mutation Start($request: TravelRequest!) { startTravel(request: $request) { response successful } }';
const PREVIEW =
    'query Preview($request: TravelRequest!) { travelPreview(request: $request) { duration distance road { coordinates distance } } }';
const TRAVEL_SUBSCRIPTION =
    'subscription OnTravel($id: String!) { characterUpdated(id: $id) { id status { location { id } activeTravel { road { coordinates distance } startTime endTime duration to } } } }';
const ACCEPT =
    'mutation Accept($request: AcceptQuestRequest!) { acceptQuest(request: $request) { response successful } }';
const STARTED_AT = new Date('2026-10-21T10:00:00.000Z');
const MALFORMED_ID = 'abc';
const MISSING_POI_ID = '64b0000000000000000000ff';
const FORBIDDEN_MESSAGE = 'Questo personaggio non ti appartiene';
const RICH_BALANCE = 6000;
const MS_PER_SECOND = 1000;

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WirePreview {
    duration: number;
    distance: number;
    road: { coordinates: number[][]; distance: number };
}

interface WireBody {
    data?: {
        startTravel?: { response: string; successful: boolean } | null;
        travelPreview?: WirePreview | null;
        acceptQuest?: { response: string; successful: boolean } | null;
    } | null;
    errors?: WireError[];
}

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
}

type TravelUpdatedResult = { characterUpdated: WireTravelCharacter };

interface TravelRequestInput {
    id: string;
    poiId: string;
}

interface Rejection {
    name: string;
    code: string;
    message: string;
    arrange: () => Promise<{
        player: TestPlayer;
        request: TravelRequestInput;
    }>;
}

describe('startTravel and travelPreview (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let quests: Model<QuestDocument>;
    let users: Model<UserDocument>;
    let world: TravelWorld;
    let seq = 0;
    const clock = new FixedClock(STARTED_AT);
    const queue = new FakeTravelQueue();
    const questQueue = new FakeTravelQueue();
    const push = new FakePushTransport();
    const opened: OpenSubscription<unknown>[] = [];

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            clock,
            imports: [TravelModule, QuestAcceptanceModule],
            overrides: [
                { token: getQueueToken(TRAVEL_QUEUE), useValue: queue },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: questQueue,
                },
                { token: QUEUE_CALL_TIMEOUT, useValue: 50 },
                { token: PushTransport, useValue: push },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
            ],
        });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        quests = harness.connection.model<QuestDocument>(Quest.name);
        users = harness.connection.model<UserDocument>(User.name);
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            pendingQuests.init(),
            quests.init(),
            users.init(),
            harness.connection.model(PushDevice.name).init(),
        ]);
        await primeCharactersChangeStream(harness);
    });

    beforeEach(async () => {
        world = await persistTravelWorld(
            harness.connection,
            harness.app.get(RoadsService),
        );
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
        queue.reset();
        questQueue.reset();
        push.reset();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function playerAt(
        location: Types.ObjectId,
        options: {
            role?: RoleType;
            activeTravel?: Record<string, unknown> | null;
            pendingQuest?: Types.ObjectId | null;
            awaitingAid?: Record<string, unknown> | null;
        } = {},
    ): Promise<TestPlayer> {
        seq += 1;
        const base = buildCharacter();
        const player = await createPlayer(harness, {
            twitchId: `twitch-travel-${seq}`,
            role: options.role,
            characterOverrides: {
                infos: { ...base.infos, name: `Viandante ${seq}` },
                status: {
                    ...base.status,
                    location,
                    title: 'rookie',
                    activeTravel: options.activeTravel ?? null,
                    awaitingAid: options.awaitingAid ?? null,
                },
                quests: {
                    completedQuests: [],
                    pendingQuest: options.pendingQuest ?? null,
                },
            },
        });
        await users.updateOne(
            { _id: player.user._id },
            { $set: { twitchPoints: RICH_BALANCE } },
        );
        return player;
    }

    function activeTravel(): Record<string, unknown> {
        const startTime = clock.now();
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
            to: world.markerB,
            kind: 'free',
        };
    }

    function awaitingAid(): Record<string, unknown> {
        return {
            quest: new Types.ObjectId(),
            aidQuest: new Types.ObjectId(),
            since: clock.now(),
        };
    }

    function characterIdOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    function requestOf(
        player: TestPlayer,
        poiId: Types.ObjectId | string,
    ): TravelRequestInput {
        return { id: characterIdOf(player), poiId: String(poiId) };
    }

    async function call(
        document: string,
        variables: Record<string, unknown>,
        bearer?: string,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            document,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    function start(
        request: TravelRequestInput,
        bearer?: string,
    ): Promise<WireBody> {
        return call(START, { request }, bearer);
    }

    function preview(
        request: TravelRequestInput,
        bearer?: string,
    ): Promise<WireBody> {
        return call(PREVIEW, { request }, bearer);
    }

    function rawCharacter(player: TestPlayer) {
        return characters.collection.findOne({ _id: player.character?._id });
    }

    function expectRejected(body: WireBody, code: string, message: string) {
        expect(body.data ?? null).toBeNull();
        expect(body.errors?.[0]?.extensions).toEqual({ code });
        expect(body.errors?.[0]?.message).toBe(message);
    }

    async function registerDevice(player: TestPlayer): Promise<void> {
        await harness.app
            .get(PushService)
            .registerDevice(String(player.user._id), {
                deviceId: 'dev-1',
                token: 'tok-1',
                platform: PushPlatform.android,
            });
    }

    function subscribe(
        player: TestPlayer,
    ): OpenSubscription<TravelUpdatedResult> {
        const subscription = openSubscription<TravelUpdatedResult>(
            graphqlWsUrl(harness.port),
            { Authorization: player.bearer },
            {
                query: TRAVEL_SUBSCRIPTION,
                variables: { id: characterIdOf(player) },
            },
        );
        opened.push(subscription);
        return subscription;
    }

    async function nextMatching(
        subscription: OpenSubscription<TravelUpdatedResult>,
        matches: (character: WireTravelCharacter) => boolean,
    ): Promise<WireTravelCharacter> {
        for (;;) {
            const result = await subscription.next();
            if (result.done) throw new Error('subscription ended');
            expect(result.value.errors).toBeUndefined();
            const character = result.value.data?.characterUpdated;
            if (character && matches(character)) return character;
        }
    }

    // l'orologio avanza solo del necessario: i bearer (TTL 900 s) restano validi
    function advancePast(endTime: Date): void {
        const remainingMs = endTime.getTime() - clock.now().getTime();
        clock.advanceSeconds(Math.ceil(remainingMs / MS_PER_SECOND) + 1);
    }

    it('starts a travel and streams it until the arrival', async () => {
        const alice = await playerAt(world.markerA);
        await registerDevice(alice);
        const subscription = subscribe(alice);
        const snapshot = await subscription.next();
        expect(snapshot.done).toBe(false);

        const body = await start(requestOf(alice, world.markerB), alice.bearer);

        expect(body.errors).toBeUndefined();
        expect(body.data?.startTravel).toEqual({
            response: 'Viaggio iniziato',
            successful: true,
        });
        const started = await nextMatching(
            subscription,
            (character) => character.status.activeTravel !== null,
        );
        const wire = started.status.activeTravel;
        expect(wire?.to).toBe(world.markerB.toHexString());
        expect(wire?.road.coordinates[0]).toEqual([0, 0]);
        expect(wire?.road.coordinates.at(-1)).toEqual([0, 0.2]);
        expect(wire?.duration).toBe(
            Date.parse(wire?.endTime as string) -
                Date.parse(wire?.startTime as string),
        );
        expect(started.status.location?.id).toBe(world.markerA.toHexString());

        advancePast(new Date(wire?.endTime as string));
        await expect(harness.app.get(TravelSweeper).sweep()).resolves.toBe(1);

        const arrived = await nextMatching(
            subscription,
            (character) => character.status.activeTravel === null,
        );
        expect(arrived.status.location?.id).toBe(world.markerB.toHexString());
        expect(push.sent).toHaveLength(1);
        expect(push.sent[0].message).toEqual(travelEnd(characterIdOf(alice)));
    });

    const REJECTIONS: Rejection[] = [
        {
            name: 'a destination that is not a city marker',
            code: 'TRAVEL_DESTINATION_NOT_ALLOWED',
            message: 'Puoi viaggiare solo verso una città',
            arrange: async () => {
                const player = await playerAt(world.markerA);
                return { player, request: requestOf(player, world.questPoi) };
            },
        },
        {
            name: 'the current location',
            code: 'TRAVEL_SAME_LOCATION',
            message: 'Sei già in questo luogo',
            arrange: async () => {
                const player = await playerAt(world.markerA);
                return { player, request: requestOf(player, world.markerA) };
            },
        },
        {
            name: 'a city without a road',
            code: 'TRAVEL_NO_PATH',
            message: 'Nessuna strada porta a questa meta',
            arrange: async () => {
                const player = await playerAt(world.markerA);
                return { player, request: requestOf(player, world.markerC) };
            },
        },
        {
            name: 'a character awaiting aid',
            code: 'AWAITING_AID',
            message: 'Il tuo personaggio è in attesa di soccorso',
            arrange: async () => {
                const player = await playerAt(world.markerA, {
                    awaitingAid: awaitingAid(),
                });
                return { player, request: requestOf(player, world.markerB) };
            },
        },
        {
            name: 'a character already travelling',
            code: 'TRAVEL_IN_PROGRESS',
            message: 'Sei già in viaggio',
            arrange: async () => {
                const player = await playerAt(world.markerA, {
                    activeTravel: activeTravel(),
                });
                return { player, request: requestOf(player, world.markerB) };
            },
        },
        {
            name: 'a character on a quest',
            code: 'QUEST_IN_PROGRESS',
            message: 'Non puoi muoverti durante una missione in corso',
            arrange: async () => {
                const player = await playerAt(world.markerA, {
                    pendingQuest: new Types.ObjectId(),
                });
                return { player, request: requestOf(player, world.markerB) };
            },
        },
        {
            name: 'a malformed point of interest id',
            code: 'NOT_FOUND',
            message: 'Luogo non trovato',
            arrange: async () => {
                const player = await playerAt(world.markerA);
                return { player, request: requestOf(player, MALFORMED_ID) };
            },
        },
        {
            name: 'a missing point of interest',
            code: 'NOT_FOUND',
            message: 'Luogo non trovato',
            arrange: async () => {
                const player = await playerAt(world.markerA);
                return { player, request: requestOf(player, MISSING_POI_ID) };
            },
        },
        {
            name: 'a malformed character id',
            code: 'NOT_FOUND',
            message: 'Personaggio non trovato',
            arrange: async () => {
                const player = await playerAt(world.markerA);
                return {
                    player,
                    request: {
                        id: MALFORMED_ID,
                        poiId: String(world.markerB),
                    },
                };
            },
        },
    ];

    it.each(REJECTIONS)(
        'rejects $name with $code and writes nothing',
        async ({ code, message, arrange }) => {
            const { player, request } = await arrange();
            const before = await rawCharacter(player);

            expectRejected(await start(request, player.bearer), code, message);
            expectRejected(
                await preview(request, player.bearer),
                code,
                message,
            );

            expect(await rawCharacter(player)).toEqual(before);
            expect(queue.added).toEqual([]);
        },
    );

    it('answers startTravel even when the queue hangs (Redis down)', async () => {
        queue.hangAdd = true;
        const alice = await playerAt(world.markerA);

        const body = await start(requestOf(alice, world.markerB), alice.bearer);

        expect(body.errors).toBeUndefined();
        expect(body.data?.startTravel).toEqual({
            response: 'Viaggio iniziato',
            successful: true,
        });
        expect((await rawCharacter(alice))?.status.activeTravel).not.toBeNull();
        expect(queue.added).toEqual([]);
    });

    it('previews on the wire with the same numbers and writes nothing', async () => {
        const alice = await playerAt(world.markerA);

        const body = await preview(
            requestOf(alice, world.markerB),
            alice.bearer,
        );

        expect(body.errors).toBeUndefined();
        const wire = body.data?.travelPreview as WirePreview;
        expect(wire.road.coordinates[0]).toEqual([0, 0]);
        expect(wire.road.coordinates.at(-1)).toEqual([0, 0.2]);
        expect(wire.distance).toBe(wire.road.distance);
        expect((await rawCharacter(alice))?.status.activeTravel).toBeNull();
        expect(queue.added).toEqual([]);

        const started = await start(
            requestOf(alice, world.markerB),
            alice.bearer,
        );
        expect(started.errors).toBeUndefined();
        const raw = await rawCharacter(alice);
        expect(raw?.status.activeTravel.duration).toBe(wire.duration);
        expect(raw?.status.activeTravel.road.distance).toBe(wire.distance);
    });

    it('forbids the innkeeper on another character without auditing', async () => {
        const alice = await playerAt(world.markerA);
        const oste = await playerAt(world.markerA, {
            role: RoleType.innkeeper,
        });
        const request = requestOf(alice, world.markerB);

        expectRejected(
            await start(request, oste.bearer),
            'FORBIDDEN',
            FORBIDDEN_MESSAGE,
        );
        expectRejected(
            await preview(request, oste.bearer),
            'FORBIDDEN',
            FORBIDDEN_MESSAGE,
        );

        expect((await rawCharacter(alice))?.status.activeTravel).toBeNull();
        expect(queue.added).toEqual([]);
        expect(
            await harness.connection.model(AdminAuditLog.name).countDocuments(),
        ).toBe(0);
    });

    it('rejects both operations without a bearer', async () => {
        const alice = await playerAt(world.markerA);
        const request = requestOf(alice, world.markerB);

        for (const body of [await start(request), await preview(request)]) {
            expect(body.errors?.[0]?.extensions).toEqual({
                code: 'UNAUTHENTICATED',
            });
        }
        expect((await rawCharacter(alice))?.status.activeTravel).toBeNull();
    });

    it('completes a quest travel without a push and starts the countdown at the planned arrival', async () => {
        const alice = await playerAt(world.markerA);
        await registerDevice(alice);
        const base = buildQuest();
        const quest = await persistQuest(quests, {
            infos: {
                ...base.infos,
                type: 'hunt',
                markerLocation: world.questPoi,
                timeToComplete: 60000,
            },
            requirements: base.requirements,
        });

        const accepted = await call(
            ACCEPT,
            {
                request: {
                    id: characterIdOf(alice),
                    questId: String(quest._id),
                },
            },
            alice.bearer,
        );
        expect(accepted.errors).toBeUndefined();
        const travelling = await rawCharacter(alice);
        const endTime = travelling?.status.activeTravel.endTime as Date;
        const pendingId = travelling?.quests.pendingQuest as Types.ObjectId;
        expect(
            (await pendingQuests.collection.findOne({ _id: pendingId }))
                ?.startDate,
        ).toBeNull();

        advancePast(endTime);
        await expect(harness.app.get(TravelSweeper).sweep()).resolves.toBe(1);

        const arrived = await rawCharacter(alice);
        expect(arrived?.status.location).toEqual(world.questPoi);
        expect(arrived?.status.activeTravel).toBeNull();
        expect(
            (await pendingQuests.collection.findOne({ _id: pendingId }))
                ?.startDate,
        ).toEqual(endTime);
        expect(push.sent).toEqual([]);
    });
});
