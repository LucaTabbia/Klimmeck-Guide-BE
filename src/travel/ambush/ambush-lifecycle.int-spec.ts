import type { Job } from 'bull';
import { toCopper } from 'src/economy/coins';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PushEventType } from 'src/push/push-event-type.enum';
import { QuestAcceptanceModule } from 'src/quests/acceptance/quest-acceptance.module';
import { levelRowFor } from 'src/quests/outcomes/progression/level-table';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import { RoadsService } from 'src/roads/roads.service';
import { travelJobId } from 'src/travel/travel-job';
import { TravelSweeper } from 'src/travel/travel-sweeper';
import { TravelModule } from 'src/travel/travel.module';
import { graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    graphqlWsUrl,
    type OpenSubscription,
    openSubscription,
} from '../../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistQuest,
} from '../../../test/fixtures';
import {
    primeChangeStream,
    questResultTouch,
} from '../../../test/harness/prime-change-stream';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { persistQuestResult } from '../../../test/quests/quest-result.fixture';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    type AmbushWorld,
    persistAmbushEnemies,
    persistAmbushWorld,
    rollsHittingKm,
    SINGLE_FIRST_CANDIDATE,
} from '../../../test/travel/ambush-world';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import { HARDY_LIFE_POINTS } from '../../../test/travel/travel-food.fixture';
import {
    type AmbushIdentity,
    type AmbushJobData,
    ambushJobId,
} from './ambush-job';
import { AmbushResolutionService } from './ambush-resolution.service';
import { AmbushSweeper } from './ambush-sweeper';
import { AmbushModule } from './ambush.module';
import { AmbushProcessor } from './ambush.processor';

// ciclo completo (D-16): partenza via GraphQL, trigger, risoluzione, arrivo, consegna, subscription e conferma.
// Tiri della SequenceChance: alla partenza un tiro per km fino al colpo; alla risoluzione la composizione
// (forma, poi scelta) e poi il risorteggio dal km dell'imboscata; fallback 0.99 = nessun colpo.
const START = new Date('2026-10-21T10:00:00.000Z');
const ONE_MINUTE_MS = 60_000;
const RANK_COPPER = 150;
const VICTORY_HP = 700;
const EVENT_WAIT_MS = 5_000;
const OPEN_WINDOW_MS = 300;
const SILENCE_WINDOW_MS = 500;
const WIRE_TRAVEL_KEYS = ['duration', 'endTime', 'road', 'startTime', 'to'];

const START_TRAVEL =
    'mutation Start($request: TravelRequest!) { startTravel(request: $request) { response successful } }';
const CHARACTER =
    'query Character($id: String!) { character(id: $id) { status { currentLifePoints coins { gold silver copper } activeTravel { road { coordinates distance } startTime endTime duration to } } } }';
const ACTIVE_TRAVEL_FIELDS =
    '{ __type(name: "ActiveTravel") { fields { name } } }';
const UNACKNOWLEDGED =
    '{ unacknowledgedQuestResults { id kind outcome resolvedAt quest { title } ambush { at nearCity { name } reachedCity { name } } } }';
const ACCEPT =
    'mutation Accept($request: AcceptQuestRequest!) { acceptQuest(request: $request) { response successful } }';
const TELEPORT =
    'mutation Teleport($request: TravelRequest!) { teleportCharacter(request: $request) { response successful } }';
const CONFIRM =
    'mutation Confirm($id: String!) { acknowledgeQuestResult(id: $id) { successful } }';
const QUEST_RESULT_RECEIVED =
    'subscription OnQuestResult($characterId: String!) { questResultReceived(characterId: $characterId) { id kind outcome } }';

interface WireResult {
    id: string;
    kind: string;
    outcome: string;
    resolvedAt: string;
    quest: { title: string } | null;
    ambush: {
        at: string;
        nearCity: { name: string };
        reachedCity: { name: string } | null;
    } | null;
}

interface WireStatus {
    currentLifePoints: number;
    coins: { gold: number; silver: number; copper: number };
    activeTravel: Record<string, unknown> | null;
}

type ReceivedResult = {
    questResultReceived: { id: string; kind: string; outcome: string };
};

describe('ambush lifecycle (replSet)', () => {
    const clock = new FixedClock(START);
    const chance = new SequenceChance();
    const combat = new ScriptedCombatResolver();
    const travelQueue = new FakeTravelQueue();
    const opened: OpenSubscription<ReceivedResult>[] = [];
    let world: OutcomeHarness;
    let map: AmbushWorld;
    let seq = 0;

    const app = () => world.harness.app;

    const moveClockTo = (instant: Date): void =>
        clock.advanceSeconds(
            (instant.getTime() - clock.now().getTime()) / 1000,
        );

    const oneMinuteAfter = (instant: Date): Date =>
        new Date(instant.getTime() + ONE_MINUTE_MS);

    const sweepAmbushes = (): Promise<number> =>
        app().get(AmbushSweeper).sweep();

    const sweepTravels = (): Promise<number> =>
        app().get(TravelSweeper).sweep();

    const idOf = (player: TestPlayer): string => String(player.character!._id);

    // in partenza da Alba al livello 1 (fascia 4–7, D-08) con le tasche vuote: 1000 HP reggono il viaggio senza cibo (Phase 14 D-02);
    // xp a 0: quella del fixture (20 000) porterebbe il livello oltre la fascia dei nemici del mondo alla prima vittoria
    const departingPlayer = async (
        status: Record<string, unknown> = {},
    ): Promise<TestPlayer> => {
        seq += 1;
        const base = buildCharacter();
        const player = await createPlayer(world.harness, {
            twitchId: `ambush-lifecycle-${seq}`,
            characterOverrides: {
                status: {
                    ...base.status,
                    location: map.markers.alba,
                    xp: 0,
                    level: 1,
                    currentLifePoints: HARDY_LIFE_POINTS,
                    maxLifePoints: HARDY_LIFE_POINTS,
                    ...status,
                },
            },
        });
        await registerDevice(world.harness, player);
        return player;
    };

    const startTravel = async (
        player: TestPlayer,
        poiId = map.markers.borgo,
    ): Promise<void> => {
        const response = await graphqlRequest(
            app(),
            START_TRAVEL,
            { request: { id: idOf(player), poiId: String(poiId) } },
            player.bearer,
        );
        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.startTravel.successful).toBe(true);
    };

    const rawTravelOf = async (player: TestPlayer): Promise<any> =>
        (
            await world.models.characters
                .findById(player.character!._id)
                .lean<any>()
                .exec()
        ).status.activeTravel;

    const identityOf = async (player: TestPlayer): Promise<AmbushIdentity> => {
        const travel = await rawTravelOf(player);
        return {
            characterId: player.character!._id as AmbushIdentity['characterId'],
            startTime: travel.startTime as Date,
            at: travel.ambush.at as Date,
        };
    };

    // l'orologio passa l'imboscata pendente e lo sweep la risolve (conta vittorie e sconfitte, non le imboscate saltate)
    const resolvePendingAmbush = async (
        player: TestPlayer,
        fought = 1,
    ): Promise<void> => {
        const { ambush } = await rawTravelOf(player);
        moveClockTo(oneMinuteAfter(ambush.at as Date));
        expect(await sweepAmbushes()).toBe(fought);
    };

    const arrive = async (player: TestPlayer): Promise<void> => {
        const { endTime } = await rawTravelOf(player);
        moveClockTo(oneMinuteAfter(endTime as Date));
        expect(await sweepTravels()).toBe(1);
    };

    const statusOf = async (player: TestPlayer): Promise<WireStatus> => {
        const response = await graphqlRequest(
            app(),
            CHARACTER,
            { id: idOf(player) },
            player.bearer,
        );
        expect(response.body.errors).toBeUndefined();
        return response.body.data.character.status as WireStatus;
    };

    const unacknowledgedOf = async (
        player: TestPlayer,
    ): Promise<WireResult[]> => {
        const response = await graphqlRequest(
            app(),
            UNACKNOWLEDGED,
            undefined,
            player.bearer,
        );
        expect(response.body.errors).toBeUndefined();
        return response.body.data.unacknowledgedQuestResults as WireResult[];
    };

    // Alba → Borgo: imboscata al km 3 vinta, risorteggio al km 9 vinto, poi nessun colpo sugli 11 km residui
    const loadTwoVictories = (): void =>
        chance.load([
            ...rollsHittingKm(3),
            ...SINGLE_FIRST_CANDIDATE,
            ...rollsHittingKm(9, 3),
            ...SINGLE_FIRST_CANDIDATE,
        ]);

    const travelWithTwoVictories = async (
        player: TestPlayer,
    ): Promise<void> => {
        loadTwoVictories();
        await startTravel(player);
        expect((await rawTravelOf(player)).ambush.km).toBe(3);
        await resolvePendingAmbush(player);
        expect((await rawTravelOf(player)).ambush.km).toBe(9);
        await resolvePendingAmbush(player);
    };

    const subscribeTo = (
        player: TestPlayer,
    ): OpenSubscription<ReceivedResult> => {
        const subscription = openSubscription<ReceivedResult>(
            graphqlWsUrl(world.harness.port),
            { Authorization: player.bearer },
            {
                query: QUEST_RESULT_RECEIVED,
                variables: { characterId: idOf(player) },
            },
        );
        opened.push(subscription);
        return subscription;
    };

    // il primo next() apre la connessione (client lazy): nessuno snapshot nella finestra;
    // avvolto: una funzione async che restituisse la promise pendente la adotterebbe, attendendo l'evento
    const openedNext = async (
        subscription: OpenSubscription<ReceivedResult>,
        timeoutMs: number,
    ) => {
        const first = subscription.next(timeoutMs);
        const early = await Promise.race([
            first.then(
                () => 'received',
                () => 'timed out',
            ),
            new Promise<string>((resolve) =>
                setTimeout(() => resolve('silent'), OPEN_WINDOW_MS),
            ),
        ]);
        expect(early).toBe('silent');
        return { pending: first };
    };

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat,
            travelQueue,
            createApp: createCharactersTestApp,
            imports: [
                TravelModule,
                AmbushModule,
                QuestAcceptanceModule,
                QuestResultsModule,
            ],
        });
        // il cursore del change stream dei risultati è aperto prima delle subscription (Pitfall 9)
        await primeChangeStream(
            world.harness,
            'questResultReceived',
            questResultTouch(world.harness),
        );
    });

    beforeEach(async () => {
        await world.reset();
        combat.reset();
        chance.load([]);
        moveClockTo(START);
        map = await persistAmbushWorld(
            world.harness.connection,
            app().get(RoadsService),
        );
        await persistAmbushEnemies(world.harness.connection);
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
    });

    afterAll(async () => {
        await world.harness.close();
    });

    it('wins two ambushes on one travel and delivers both reports at arrival in order (D-02, D-13)', async () => {
        const player = await departingPlayer();
        await travelWithTwoVictories(player);
        const travel = await rawTravelOf(player);
        expect(travel.ambush ?? null).toBeNull();
        expect(travel.ambushReports).toHaveLength(2);
        const [first, second] = travel.ambushReports as { at: Date }[];
        const later = await persistQuestResult(world.models.questResults, {
            character: player.character!._id,
            user: player.user._id,
            resolvedAt: oneMinuteAfter(travel.endTime as Date),
        });

        await arrive(player);

        const results = await unacknowledgedOf(player);
        expect(
            results.map(({ kind, resolvedAt }) => ({ kind, resolvedAt })),
        ).toEqual([
            { kind: 'ambush', resolvedAt: first.at.toISOString() },
            { kind: 'ambush', resolvedAt: second.at.toISOString() },
            {
                kind: 'quest',
                resolvedAt: (later.resolvedAt as Date).toISOString(),
            },
        ]);
        expect(results.slice(0, 2)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                quest: null,
                ambush: {
                    at: first.at.toISOString(),
                    nearCity: { name: 'Alba' },
                    reachedCity: null,
                },
            }),
            expect.objectContaining({
                outcome: 'success',
                quest: null,
                ambush: {
                    at: second.at.toISOString(),
                    nearCity: { name: 'Crocevia' },
                    reachedCity: null,
                },
            }),
        ]);
        expect(await rawTravelOf(player)).toBeNull();
    });

    it('shows the victory effects at once and holds the report until arrival (D-17)', async () => {
        const player = await departingPlayer();
        chance.load([...rollsHittingKm(3), ...SINGLE_FIRST_CANDIDATE]);
        combat.willResolve(player.character!._id as never, {
            hpAfter: VICTORY_HP,
        });
        await startTravel(player);
        const before = await statusOf(player);

        await resolvePendingAmbush(player);

        const after = await statusOf(player);
        expect(before.currentLifePoints).toBeGreaterThan(VICTORY_HP);
        expect(after.currentLifePoints).toBe(VICTORY_HP);
        expect(toCopper(after.coins) - toCopper(before.coins)).toBe(
            RANK_COPPER,
        );
        expect(await unacknowledgedOf(player)).toEqual([]);
        expect((await rawTravelOf(player)).ambushReports).toHaveLength(1);
    });

    it('keeps the wire travel identical across the journey (D-15)', async () => {
        const introspection = await graphqlRequest(app(), ACTIVE_TRAVEL_FIELDS);
        expect(
            (introspection.body.data.__type.fields as { name: string }[])
                .map(({ name }) => name)
                .sort(),
        ).toEqual(WIRE_TRAVEL_KEYS);
        const player = await departingPlayer();
        loadTwoVictories();
        await startTravel(player);
        const departed = (await statusOf(player)).activeTravel!;
        const steps = [departed];

        await resolvePendingAmbush(player);
        steps.push((await statusOf(player)).activeTravel!);
        await resolvePendingAmbush(player);
        steps.push((await statusOf(player)).activeTravel!);

        for (const step of steps) {
            expect(Object.keys(step).sort()).toEqual(WIRE_TRAVEL_KEYS);
            expect(step).toEqual(departed);
        }
        await arrive(player);
        expect((await statusOf(player)).activeTravel).toBeNull();
    });

    it('delivers the reports to the owner only and acknowledges them (D-13)', async () => {
        const player = await departingPlayer();
        const stranger = await departingPlayer();
        const own = subscribeTo(player);
        const ownFirst = (await openedNext(own, EVENT_WAIT_MS)).pending;
        const strangerHeard = (
            await openedNext(subscribeTo(stranger), EVENT_WAIT_MS)
        ).pending.then(
            () => 'received',
            () => 'timed out',
        );
        await travelWithTwoVictories(player);

        await arrive(player);

        const received = [await ownFirst, await own.next(EVENT_WAIT_MS)].map(
            (result) => result.value!.data!.questResultReceived,
        );
        const results = await unacknowledgedOf(player);
        expect(received.map(({ id }) => id).sort()).toEqual(
            results.map(({ id }) => id).sort(),
        );
        expect(received.map(({ kind }) => kind)).toEqual(['ambush', 'ambush']);
        // prova negativa dopo la sentinella: i due report del proprietario sono già arrivati
        expect(
            await Promise.race([
                strangerHeard,
                new Promise<string>((resolve) =>
                    setTimeout(() => resolve('silent'), SILENCE_WINDOW_MS),
                ),
            ]),
        ).toBe('silent');

        const confirmed = await graphqlRequest(
            app(),
            CONFIRM,
            { id: results[0].id },
            player.bearer,
        );

        expect(confirmed.body).toEqual({
            data: { acknowledgeQuestResult: { successful: true } },
        });
        expect((await unacknowledgedOf(player)).map(({ id }) => id)).toEqual([
            results[1].id,
        ]);
    });

    it('completes the travel only after the pending ambush is resolved (D-13)', async () => {
        const player = await departingPlayer();
        chance.load([...rollsHittingKm(16), ...SINGLE_FIRST_CANDIDATE]);
        await startTravel(player);
        const { startTime, endTime } = await rawTravelOf(player);
        moveClockTo(oneMinuteAfter(endTime as Date));
        travelQueue.added.length = 0;

        expect(await sweepTravels()).toBe(0);
        expect((await rawTravelOf(player)).ambush.km).toBe(16);

        expect(await sweepAmbushes()).toBe(1);
        expect(travelQueue.added).toEqual([
            expect.objectContaining({
                name: 'complete',
                options: expect.objectContaining({
                    jobId: travelJobId(
                        player.character!._id as never,
                        startTime,
                    ),
                }),
            }),
        ]);
        expect(await unacknowledgedOf(player)).toEqual([]);

        expect(await sweepTravels()).toBe(1);
        expect(await rawTravelOf(player)).toBeNull();
        expect(
            (await unacknowledgedOf(player)).map(({ kind }) => kind),
        ).toEqual(['ambush']);
        expect(world.push.sent.map(({ message }) => message.type)).toEqual([
            PushEventType.travelEnd,
        ]);
    });

    it('resolves one ambush once under two concurrent triggers (D-05)', async () => {
        const player = await departingPlayer();
        chance.load([
            ...rollsHittingKm(16),
            ...SINGLE_FIRST_CANDIDATE,
            ...SINGLE_FIRST_CANDIDATE,
        ]);
        await startTravel(player);
        const before = await statusOf(player);
        const identity = await identityOf(player);
        moveClockTo(oneMinuteAfter(identity.at));
        const resolution = app().get(AmbushResolutionService);

        const outcomes = await Promise.all([
            resolution.resolve(identity),
            resolution.resolve(identity),
        ]);

        expect([...outcomes].sort()).toEqual(['stale', 'won']);
        expect((await rawTravelOf(player)).ambushReports).toHaveLength(1);
        expect(toCopper((await statusOf(player)).coins)).toBe(
            toCopper(before.coins) + RANK_COPPER,
        );
    });

    describe('defeats, thresholds and triggers', () => {
        const NIGHT_IN_ROME = new Date('2026-10-21T20:00:00.000Z');
        const DAY_IN_ROME = new Date('2026-10-21T10:00:00.000Z');
        const BEFORE_DST = new Date('2026-03-28T03:30:00.000Z');
        const AFTER_DST = new Date('2026-03-29T03:30:00.000Z');
        // fra il rischio del giorno (0.002) e quello della notte (0.006)
        const NIGHT_ONLY_HIT = 0.004;
        const LEVEL_TWENTY_XP = 50_000;
        const POLL_STEP_MS = 50;
        const POLL_DEADLINE_MS = 5_000;

        const defeatBody = (city: string): string =>
            `Sei stato sconfitto: la via torna verso ${city}`;

        const pushTypesOf = (): string[] =>
            world.push.sent.map(({ message }) => message.type);

        const ambushJobsAdded = () =>
            travelQueue.added.filter(({ name }) => name === 'ambush');

        // il job com'era accodato alla partenza o dopo la vittoria, consegnato a mano al processor
        const runJob = (job: {
            data: unknown;
            options: Record<string, unknown>;
        }): Promise<void> =>
            app()
                .get(AmbushProcessor)
                .handle({
                    id: job.options.jobId,
                    data: job.data,
                } as Job<AmbushJobData>);

        const teleportByGm = async (
            player: TestPlayer,
            poiId = map.markers.erta,
        ): Promise<void> => {
            seq += 1;
            const gm = await createPlayer(world.harness, {
                twitchId: `ambush-lifecycle-gm-${seq}`,
                role: RoleType.innkeeper,
            });
            const response = await graphqlRequest(
                app(),
                TELEPORT,
                { request: { id: idOf(player), poiId: String(poiId) } },
                gm.bearer,
            );
            expect(response.body.errors).toBeUndefined();
            expect(response.body.data.teleportCharacter.successful).toBe(true);
        };

        const acceptQuest = async (
            player: TestPlayer,
            questId: unknown,
        ): Promise<void> => {
            const response = await graphqlRequest(
                app(),
                ACCEPT,
                { request: { id: idOf(player), questId: String(questId) } },
                player.bearer,
            );
            expect(response.body.errors).toBeUndefined();
            expect(response.body.data.acceptQuest.successful).toBe(true);
        };

        const rawCharacterOf = async (player: TestPlayer): Promise<any> =>
            world.models.characters
                .findById(player.character!._id)
                .lean<any>()
                .exec();

        const pause = (ms: number): Promise<void> =>
            new Promise((resolve) => setTimeout(resolve, ms));

        const waitFor = async (
            predicate: () => Promise<boolean>,
        ): Promise<boolean> => {
            const deadline = Date.now() + POLL_DEADLINE_MS;
            while (Date.now() < deadline) {
                if (await predicate()) return true;
                await pause(POLL_STEP_MS);
            }
            return predicate();
        };

        it('loses on a quest travel, abandons the quest, detours and delivers at the city (D-11, D-12, D-13)', async () => {
            const player = await departingPlayer();
            const base = buildQuest();
            const quest = await persistQuest(world.models.quests, {
                infos: {
                    ...base.infos,
                    type: 'enemy',
                    markerLocation: map.questPoi,
                    timeToComplete: 60_000,
                },
                requirements: {
                    ...base.requirements,
                    requiredAdventurers: [{ title: null, count: 2 }],
                },
            });
            chance.load([...rollsHittingKm(10), ...SINGLE_FIRST_CANDIDATE]);
            combat
                .willEnd('failure')
                .willResolve(player.character!._id as never, { hpAfter: 0 });
            await acceptQuest(player, quest._id);
            const accepted = await rawCharacterOf(player);
            const pendingQuestId = accepted.quests.pendingQuest;
            expect(accepted.status.activeTravel.ambush.km).toBe(10);
            expect(
                (await world.models.quests.findById(quest._id).lean<any>())
                    .registeredAdventurers,
            ).toHaveLength(1);

            await resolvePendingAmbush(player);

            const defeated = await rawCharacterOf(player);
            expect(defeated.quests.pendingQuest).toBeNull();
            expect(
                await world.models.pendingQuests.findById(pendingQuestId),
            ).toBeNull();
            expect(
                (await world.models.quests.findById(quest._id).lean<any>())
                    .registeredAdventurers,
            ).toEqual([]);
            expect(defeated.status.currentLifePoints).toBeGreaterThanOrEqual(1);
            expect(String(defeated.status.activeTravel.to)).toBe(
                String(map.markers.crocevia),
            );
            expect(world.push.sent.map(({ message }) => message)).toEqual([
                expect.objectContaining({
                    type: PushEventType.ambushDefeat,
                    body: defeatBody('Crocevia'),
                }),
            ]);

            await arrive(player);

            expect(await unacknowledgedOf(player)).toEqual([
                expect.objectContaining({
                    kind: 'ambush',
                    outcome: 'failure',
                    ambush: expect.objectContaining({
                        reachedCity: { name: 'Crocevia' },
                    }),
                }),
            ]);
            expect(String((await rawCharacterOf(player)).status.location)).toBe(
                String(map.markers.crocevia),
            );
            expect(pushTypesOf()).toEqual([
                PushEventType.ambushDefeat,
                PushEventType.travelEnd,
            ]);
        });

        it('detours to the destination when it is the nearest city and still pushes (D-11, D-12)', async () => {
            const player = await departingPlayer();
            chance.load([...rollsHittingKm(16), ...SINGLE_FIRST_CANDIDATE]);
            combat.willEnd('failure');
            await startTravel(player);

            await resolvePendingAmbush(player);

            expect(String((await rawTravelOf(player)).to)).toBe(
                String(map.markers.borgo),
            );
            expect(world.push.sent.map(({ message }) => message)).toEqual([
                expect.objectContaining({
                    type: PushEventType.ambushDefeat,
                    body: defeatBody('Borgo'),
                }),
            ]);
        });

        it('pushes every defeat and never a victory (D-12)', async () => {
            const player = await departingPlayer();
            loadTwoVictories();
            let fights = 0;
            combat.willEndBy(() => (++fights === 1 ? 'success' : 'failure'));
            await startTravel(player);

            await resolvePendingAmbush(player);
            expect(pushTypesOf()).toEqual([]);
            await resolvePendingAmbush(player);
            expect(pushTypesOf()).toEqual([PushEventType.ambushDefeat]);
            await arrive(player);

            expect(
                (await unacknowledgedOf(player)).map(({ outcome }) => outcome),
            ).toEqual(['success', 'failure']);
            expect(pushTypesOf()).toEqual([
                PushEventType.ambushDefeat,
                PushEventType.travelEnd,
            ]);
        });

        it('draws at night but not by day in the configured zone (D-01)', async () => {
            const night = await departingPlayer();
            const day = await departingPlayer();

            moveClockTo(NIGHT_IN_ROME);
            chance.load([NIGHT_ONLY_HIT]);
            await startTravel(night);
            moveClockTo(DAY_IN_ROME);
            chance.load([NIGHT_ONLY_HIT]);
            await startTravel(day);

            expect((await rawTravelOf(night)).ambush.km).toBe(1);
            expect((await rawTravelOf(day)).ambush ?? null).toBeNull();
            expect(chance.drawn[0]).toBe(NIGHT_ONLY_HIT);
        });

        it('follows the daylight saving change of the zone (D-01)', async () => {
            const winter = await departingPlayer();
            const summer = await departingPlayer();

            moveClockTo(BEFORE_DST);
            chance.load([NIGHT_ONLY_HIT]);
            await startTravel(winter);
            moveClockTo(AFTER_DST);
            chance.load([NIGHT_ONLY_HIT]);
            await startTravel(summer);

            expect((await rawTravelOf(winter)).ambush.km).toBe(1);
            expect((await rawTravelOf(summer)).ambush ?? null).toBeNull();
        });

        it('never draws under ten km and never redraws with less than ten km left (D-03)', async () => {
            const short = await departingPlayer();
            await startTravel(short, map.markers.erta);
            expect((await rawTravelOf(short)).ambush ?? null).toBeNull();
            expect(chance.drawn).toEqual([]);

            const long = await departingPlayer();
            const departure = rollsHittingKm(11);
            chance.load([...departure, ...SINGLE_FIRST_CANDIDATE]);
            await startTravel(long);
            await resolvePendingAmbush(long);

            const travel = await rawTravelOf(long);
            expect(travel.ambush).toBeNull();
            expect(travel.ambushReports).toHaveLength(1);
            expect(chance.drawn).toHaveLength(
                departure.length + SINGLE_FIRST_CANDIDATE.length,
            );
        });

        it('ignores duplicate, early and stale ambush jobs (D-05)', async () => {
            const player = await departingPlayer();
            loadTwoVictories();
            await startTravel(player);
            const [departureJob] = ambushJobsAdded();

            await runJob(departureJob);
            expect((await rawTravelOf(player)).ambush.km).toBe(3);
            expect((await rawTravelOf(player)).ambushReports ?? []).toEqual([]);

            moveClockTo(oneMinuteAfter((await identityOf(player)).at));
            await runJob(departureJob);
            await runJob(departureJob);
            const travel = await rawTravelOf(player);
            expect(travel.ambush.km).toBe(9);
            expect(travel.ambushReports).toHaveLength(1);

            const [, redrawnJob] = ambushJobsAdded();
            await teleportByGm(player);
            moveClockTo(oneMinuteAfter(travel.ambush.at as Date));
            await runJob(redrawnJob);

            expect(await world.models.questResults.countDocuments()).toBe(1);
            expect((await rawCharacterOf(player)).status.activeTravel).toBe(
                null,
            );
            expect(combat.contexts).toHaveLength(1);
        });

        it('resolves a lost job at boot and on sweep (D-05)', async () => {
            const sweeper = app().get(AmbushSweeper);
            const atBoot = await departingPlayer();
            chance.load([...rollsHittingKm(16), ...SINGLE_FIRST_CANDIDATE]);
            await startTravel(atBoot);
            moveClockTo(oneMinuteAfter((await identityOf(atBoot)).at));

            sweeper.onApplicationBootstrap();

            expect(
                await waitFor(
                    async () =>
                        ((await rawTravelOf(atBoot)).ambushReports ?? [])
                            .length === 1,
                ),
            ).toBe(true);
            // il reconciler non si attende: lo sweep successivo parte dopo la sua fine (single-flight)
            await sweeper.sweep();

            const onSweep = await departingPlayer();
            chance.load([...rollsHittingKm(16), ...SINGLE_FIRST_CANDIDATE]);
            await startTravel(onSweep);
            moveClockTo(oneMinuteAfter((await identityOf(onSweep)).at));

            expect(await sweeper.sweep()).toBe(1);
            expect((await rawTravelOf(onSweep)).ambushReports).toHaveLength(1);
            expect(travelQueue.process).not.toHaveBeenCalled();
        });

        it('cancels the pending ambush and delivers the reports on teleport (D-02, D-13)', async () => {
            const player = await departingPlayer();
            loadTwoVictories();
            await startTravel(player);
            await resolvePendingAmbush(player);
            const pending = await identityOf(player);

            await teleportByGm(player);

            expect(
                (await unacknowledgedOf(player)).map(({ kind }) => kind),
            ).toEqual(['ambush']);
            expect(travelQueue.removed).toContain(
                ambushJobId(pending.characterId, pending.startTime, pending.at),
            );
            moveClockTo(oneMinuteAfter(pending.at));
            expect(await sweepAmbushes()).toBe(0);
            expect(await world.models.questResults.countDocuments()).toBe(1);
        });

        it('skips an ambush without composable enemies (D-08)', async () => {
            const row = levelRowFor(LEVEL_TWENTY_XP);
            const player = await departingPlayer({
                xp: LEVEL_TWENTY_XP,
                level: row.level,
            });
            // solo i tiri della partenza: con il fallback nessuna forma compone un branco di draghi (fascia del livello 20)
            chance.load(rollsHittingKm(3));
            await startTravel(player);
            const before = await statusOf(player);

            await resolvePendingAmbush(player, 0);

            const travel = await rawTravelOf(player);
            expect(travel.ambush).toBeNull();
            expect(travel.ambushReports ?? []).toEqual([]);
            expect(combat.contexts).toEqual([]);
            expect(await statusOf(player)).toEqual(before);
            await arrive(player);
            expect(await unacknowledgedOf(player)).toEqual([]);
        });
    });
});
