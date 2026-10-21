import { BullModule, getQueueToken } from '@nestjs/bull';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bull';
import { Connection, Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { User, UserDocument } from 'src/models/user.model';
import { PushDevice } from 'src/push/push-device.model';
import { travelEnd } from 'src/push/push-events';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushService } from 'src/push/push.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { TRAVEL_COMPLETE_JOB, TRAVEL_QUEUE, travelJobId } from './travel-job';
import { TravelModule } from './travel.module';
import { buildCharacter, persistCharacter } from '../../test/fixtures';
import { FakePushTransport } from '../../test/push/fake-push-transport';
import { startRedis, stopRedis } from '../../test/setup/redis';
import { buildActiveTravelDoc } from '../../test/travel/active-travel.fixture';

const WAIT_DEADLINE_MS = 15_000;
const POLL_STEP_MS = 100;
const NEGATIVE_WAIT_MS = 500;
const TEST_TIMEOUT_MS = 30_000;
const HOUR_MS = 3_600_000;
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');

const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// polling con deadline: mai job.finished() (open handle, Phase 1 D-06)
async function waitFor(
    predicate: () => Promise<boolean> | boolean,
    timeoutMs = WAIT_DEADLINE_MS,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await pause(POLL_STEP_MS);
    }
    return predicate();
}

/**
 * INTEGRATION: il job Bull 'complete' della coda 'travel' su Redis effimero REALE e replSet condiviso.
 * SystemClock reale (Pitfall 7: il delay Bull usa il tempo reale); CharactersService assente (nessun change stream).
 */
describe('TravelCompletionProcessor (real Redis)', () => {
    let app: INestApplication;
    let queue: Queue;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let pushService: PushService;
    let connection: Connection;
    let seq = 0;
    const push = new FakePushTransport();

    beforeAll(async () => {
        const { host, port } = await startRedis();
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'travel-processor-test',
                }),
                BullModule.forRoot({ redis: { host, port } }),
                TravelModule,
            ],
        })
            .overrideProvider(PushTransport)
            .useValue(push)
            .overrideProvider(PUSH_CONFIG)
            .useValue({ serviceAccount: null })
            .overrideProvider(TRAVEL_CONFIG)
            .useValue({ sweepIntervalMs: 0 })
            .compile();

        app = moduleRef.createNestApplication();
        await app.init();

        queue = app.get<Queue>(getQueueToken(TRAVEL_QUEUE));
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        users = app.get<Model<UserDocument>>(getModelToken(User.name));
        pushService = app.get(PushService);
        connection = app.get<Connection>(getConnectionToken());
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([
            characters.init(),
            users.init(),
            connection.model(PushDevice.name).init(),
        ]);
    }, 120_000);

    beforeEach(() => {
        push.reset();
    });

    // documenti scritti dalla connessione Nest: sfuggono alla pulizia globale
    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(
            Object.values(connection.collections).map((collection) =>
                collection.deleteMany({}),
            ),
        );
    });

    afterAll(async () => {
        // Redis condiviso in CI (Pitfall 6): nessun job residuo per le suite successive
        if (queue) await queue.empty();
        if (app) {
            await connection.dropDatabase();
            await app.close();
        }
        await stopRedis();
    });

    interface Traveller {
        id: Types.ObjectId;
        destination: Types.ObjectId;
        startTime: Date;
        endTime: Date;
    }

    // personaggio in viaggio libero con proprietario e un device registrato
    async function ownedTraveller(
        endTime: Date,
        character: Record<string, unknown> = {},
    ): Promise<Traveller> {
        seq += 1;
        const destination = new Types.ObjectId();
        const startTime = new Date(endTime.getTime() - HOUR_MS);
        const created = await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name: `Viandante ${seq}` },
            status: {
                ...buildCharacter().status,
                location: new Types.ObjectId(),
                activeTravel: buildActiveTravelDoc({
                    to: destination,
                    startTime,
                    endTime,
                }),
            },
            ...character,
        });
        const id = created._id as Types.ObjectId;
        const user = await users.create({
            twitchId: `tw-processor-${seq}`,
            twitchPoints: 0,
            role: 'adventurer',
            currentCharacter: id,
        });
        await pushService.registerDevice(String(user._id), {
            deviceId: 'dev-1',
            token: 'tok-1',
            platform: PushPlatform.android,
        });
        return { id, destination, startTime, endTime };
    }

    function enqueue(
        traveller: Traveller,
        delay: number,
        startTime: Date = traveller.startTime,
    ) {
        return queue.add(
            TRAVEL_COMPLETE_JOB,
            {
                characterId: traveller.id.toHexString(),
                startTime: startTime.getTime(),
                endTime: traveller.endTime.getTime(),
            },
            { jobId: travelJobId(traveller.id, startTime), delay },
        );
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    async function travelDone(id: Types.ObjectId): Promise<boolean> {
        return (await rawCharacter(id))?.status.activeTravel === null;
    }

    async function jobSettled(jobId: string): Promise<boolean> {
        const job = await queue.getJob(jobId);
        return job === null || (await job.isCompleted());
    }

    it(
        'completes an expired free travel when the job fires',
        async () => {
            const traveller = await ownedTraveller(new Date(Date.now() - 1000));

            await enqueue(traveller, 0);

            expect(await waitFor(() => travelDone(traveller.id))).toBe(true);
            const raw = await rawCharacter(traveller.id);
            expect(raw?.status.location).toEqual(traveller.destination);
            expect(await waitFor(() => push.sent.length === 1)).toBe(true);
            expect(push.sent).toEqual([
                {
                    tokens: ['tok-1'],
                    message: travelEnd(traveller.id.toHexString()),
                },
            ]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'completes a short travel after its delay',
        async () => {
            const traveller = await ownedTraveller(new Date(Date.now() + 300));

            await enqueue(traveller, 300);

            expect(await waitFor(() => travelDone(traveller.id))).toBe(true);
            expect((await rawCharacter(traveller.id))?.status.location).toEqual(
                traveller.destination,
            );
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'ignores a duplicate job id',
        async () => {
            const traveller = await ownedTraveller(new Date(Date.now() - 1000));
            const jobId = travelJobId(traveller.id, traveller.startTime);

            await enqueue(traveller, 0);
            expect(await waitFor(() => push.sent.length === 1)).toBe(true);
            expect(await waitFor(() => jobSettled(jobId))).toBe(true);

            await enqueue(traveller, 0);
            // asserzione negativa: nessun evento da attendere, solo una finestra fissa
            await pause(NEGATIVE_WAIT_MS);

            expect(push.sent).toHaveLength(1);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'leaves an early job to the sweep',
        async () => {
            const log = jest.spyOn(Logger.prototype, 'log');
            const traveller = await ownedTraveller(
                new Date(Date.now() + 60_000),
            );
            const jobId = travelJobId(traveller.id, traveller.startTime);
            const message = `Job di viaggio ${jobId} in anticipo: lo completerà lo sweep`;
            const before = await rawCharacter(traveller.id);

            await enqueue(traveller, 0);
            expect(
                await waitFor(() =>
                    log.mock.calls.some(([value]) => value === message),
                ),
            ).toBe(true);
            // asserzione negativa: il processor ha già risposto, la finestra esclude scritture tardive
            await pause(NEGATIVE_WAIT_MS);

            expect(await rawCharacter(traveller.id)).toEqual(before);
            expect(push.sent).toEqual([]);
            // mai ri-accodato (C10): il job è concluso, nessun delayed o waiting con quell'id
            expect(await jobSettled(jobId)).toBe(true);
            const pending = await queue.getJobs(['delayed', 'waiting']);
            expect(pending.map((job) => job.id)).not.toContain(jobId);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'skips a stale or archived travel',
        async () => {
            const stale = await ownedTraveller(new Date(Date.now() - 1000));
            const archived = await ownedTraveller(new Date(Date.now() - 1000), {
                deletedAt: ARCHIVED_AT,
            });
            const staleBefore = await rawCharacter(stale.id);
            const archivedBefore = await rawCharacter(archived.id);
            const staleStart = new Date(stale.startTime.getTime() + 1);

            await enqueue(stale, 0, staleStart);
            await enqueue(archived, 0);
            expect(
                await waitFor(
                    async () =>
                        (await jobSettled(travelJobId(stale.id, staleStart))) &&
                        (await jobSettled(
                            travelJobId(archived.id, archived.startTime),
                        )),
                ),
            ).toBe(true);

            expect(await rawCharacter(stale.id)).toEqual(staleBefore);
            expect(await rawCharacter(archived.id)).toEqual(archivedBefore);
            expect(push.sent).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'skips malformed job data',
        async () => {
            const warn = jest.spyOn(Logger.prototype, 'warn');

            const job = await queue.add(TRAVEL_COMPLETE_JOB, {
                characterId: 'abc',
                startTime: 1,
                endTime: 2,
            });
            const message = `Job di viaggio ${String(job.id)} malformato: ignorato`;

            expect(
                await waitFor(() =>
                    warn.mock.calls.some(([value]) => value === message),
                ),
            ).toBe(true);
            expect(push.sent).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );
});
