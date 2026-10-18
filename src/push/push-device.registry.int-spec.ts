import { MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    PushDevice,
    PushDeviceDocument,
    PushDeviceSchema,
} from 'src/push/push-device.model';
import {
    DeviceRegistration,
    PushDeviceRegistry,
} from 'src/push/push-device.registry';
import { PushPlatform } from 'src/push/push-platform.enum';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';

const ALICE = new Types.ObjectId();
const BRUNO = new Types.ObjectId();
const T0 = new Date('2026-10-18T10:00:00Z');
const T1 = new Date('2026-10-18T10:05:00Z');
const CONCURRENT_ITERATIONS = 20;

function registration(
    userId: Types.ObjectId,
    deviceId: string,
    token: string,
    platform: PushPlatform = PushPlatform.android,
): DeviceRegistration {
    return { userId, deviceId, token, platform };
}

describe('PushDeviceRegistry (replSet)', () => {
    let harness: AuthTestApp;
    let registry: PushDeviceRegistry;
    let devices: Model<PushDeviceDocument>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: PushDevice.name, schema: PushDeviceSchema },
                ]),
            ],
            providers: [PushDeviceRegistry],
        });
        registry = harness.app.get(PushDeviceRegistry);
        devices = harness.connection.model<PushDeviceDocument>(PushDevice.name);
        await devices.init();
    });

    afterEach(() => harness.clearDatabase());

    afterAll(() => harness.close());

    it('enforces the device, token and TTL indexes in the database', async () => {
        await expect(devices.collection.indexes()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    key: { userId: 1, deviceId: 1 },
                    unique: true,
                }),
                expect.objectContaining({ key: { token: 1 }, unique: true }),
                expect.objectContaining({
                    key: { lastSeenAt: 1 },
                    expireAfterSeconds: 23328000,
                }),
            ]),
        );
    });

    describe('claim', () => {
        it('stores a first registration with an ObjectId owner and returns no previous token', async () => {
            await expect(
                registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T0),
            ).resolves.toBeNull();

            const rows = await devices.find().lean();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                deviceId: 'dev-1',
                token: 'tok-a',
                platform: 'android',
                lastSeenAt: T0,
            });
            const raw = await devices.collection.findOne({});
            expect(
                (raw?.userId as { _bsontype?: string } | undefined)?._bsontype,
            ).toBe('ObjectId');
            expect(String(raw?.userId)).toBe(String(ALICE));
        });

        it('refreshes lastSeenAt on a repeated registration without duplicating the row', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T0);

            await expect(
                registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T1),
            ).resolves.toBe('tok-a');

            await expect(devices.countDocuments()).resolves.toBe(1);
            const row = await devices.findOne().lean();
            expect(row?.lastSeenAt).toEqual(T1);
        });

        it('replaces the token of the same device and returns the previous one', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T0);

            await expect(
                registry.claim(
                    registration(ALICE, 'dev-1', 'tok-b', PushPlatform.ios),
                    T1,
                ),
            ).resolves.toBe('tok-a');

            const rows = await devices.find().lean();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                deviceId: 'dev-1',
                token: 'tok-b',
                platform: 'ios',
            });
        });

        it('moves a token claimed by another user to the new owner', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T0);

            await expect(
                registry.claim(registration(BRUNO, 'dev-9', 'tok-a'), T1),
            ).resolves.toBeNull();

            const rows = await devices.find().lean();
            expect(rows).toHaveLength(1);
            expect(String(rows[0].userId)).toBe(String(BRUNO));
            await expect(
                devices.countDocuments({ userId: ALICE }),
            ).resolves.toBe(0);
        });

        it('moves a token to another device of the same user', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T0);

            await registry.claim(registration(ALICE, 'dev-2', 'tok-a'), T1);

            const rows = await devices.find().lean();
            expect(rows).toHaveLength(1);
            expect(rows[0].deviceId).toBe('dev-2');
        });

        it('keeps a single row when the same device registers concurrently', async () => {
            const claims = ['tok-1', 'tok-2', 'tok-3', 'tok-4', 'tok-5'].map(
                (token) =>
                    registry.claim(registration(ALICE, 'dev-1', token), T0),
            );

            await expect(Promise.all(claims)).resolves.toHaveLength(5);

            await expect(
                devices.countDocuments({ userId: ALICE, deviceId: 'dev-1' }),
            ).resolves.toBe(1);
        });

        it('keeps exactly one holder when two users claim the same token concurrently', async () => {
            for (
                let iteration = 0;
                iteration < CONCURRENT_ITERATIONS;
                iteration++
            ) {
                await harness.clearDatabase();

                await Promise.all([
                    registry.claim(
                        registration(ALICE, 'dev-a', 'tok-shared'),
                        T0,
                    ),
                    registry.claim(
                        registration(BRUNO, 'dev-b', 'tok-shared'),
                        T0,
                    ),
                ]);

                await expect(
                    devices.countDocuments({ token: 'tok-shared' }),
                ).resolves.toBe(1);
            }
        });
    });

    describe('unregister', () => {
        it('removes the device and returns its token, then returns null', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-a'), T0);

            await expect(registry.unregister(ALICE, 'dev-1')).resolves.toBe(
                'tok-a',
            );
            await expect(devices.countDocuments()).resolves.toBe(0);
            await expect(
                registry.unregister(ALICE, 'dev-1'),
            ).resolves.toBeNull();
        });

        it('never removes the device of another user', async () => {
            await registry.claim(registration(BRUNO, 'dev-x', 'tok-b'), T0);

            await expect(
                registry.unregister(ALICE, 'dev-x'),
            ).resolves.toBeNull();

            await expect(
                devices.countDocuments({ userId: BRUNO, deviceId: 'dev-x' }),
            ).resolves.toBe(1);
        });
    });

    describe('tokensOf', () => {
        it('returns only the tokens of the given user', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-1'), T0);
            await registry.claim(registration(ALICE, 'dev-2', 'tok-2'), T0);
            await registry.claim(registration(BRUNO, 'dev-3', 'tok-3'), T0);

            const tokens = await registry.tokensOf(ALICE);

            expect([...tokens].sort()).toEqual(['tok-1', 'tok-2']);
        });
    });

    describe('removeTokens', () => {
        it('deletes the matching rows and returns how many were removed', async () => {
            await registry.claim(registration(ALICE, 'dev-1', 'tok-1'), T0);

            await expect(
                registry.removeTokens(['tok-1', 'tok-missing']),
            ).resolves.toBe(1);
            await expect(devices.countDocuments()).resolves.toBe(0);
        });

        it('returns 0 without querying when there is nothing to remove', async () => {
            const deleteMany = jest.spyOn(devices, 'deleteMany');

            await expect(registry.removeTokens([])).resolves.toBe(0);

            expect(deleteMany).not.toHaveBeenCalled();
            deleteMany.mockRestore();
        });
    });
});
