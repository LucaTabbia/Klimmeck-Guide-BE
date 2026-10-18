import { Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { User, UserDocument } from 'src/models/user.model';
import { PushDevice, PushDeviceDocument } from 'src/push/push-device.model';
import { PushModule } from 'src/push/push.module';
import { PushTransport } from 'src/push/transport/push-transport';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { FakePushTransport } from '../../test/push/fake-push-transport';

const REGISTER =
    'mutation($input: RegisterPushDeviceInput!) { registerPushDevice(input: $input) }';
const UNREGISTER =
    'mutation($deviceId: String!) { unregisterPushDevice(deviceId: $deviceId) }';
const USER_FIELDS = '{ __type(name: "User") { fields { name } } }';
const PUSH_DEVICE_TYPE = '{ __type(name: "PushDevice") { name } }';
const ME = '{ me { id } }';

const STREAMER_LIVE = 'streamer-live';
const LAST_SEEN_GAP_MS = 5;

interface WireError {
    message: string;
    extensions?: { code?: string };
}

interface WireBody {
    data?: Record<string, any> | null;
    errors?: WireError[];
}

interface DeviceInput {
    deviceId: string;
    token: string;
    platform: string;
}

const deviceInput = (overrides: Partial<DeviceInput> = {}): DeviceInput => ({
    deviceId: 'dev-1',
    token: 'tok-a',
    platform: 'android',
    ...overrides,
});

const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

describe('push device registration (wire)', () => {
    let harness: AuthTestApp;
    let transport: FakePushTransport;
    let devices: Model<PushDeviceDocument>;
    let users: Model<UserDocument>;

    async function call(
        query: string,
        bearer?: string,
        variables?: Record<string, unknown>,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            query,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    function register(
        player: TestPlayer | null,
        input: DeviceInput = deviceInput(),
    ): Promise<WireBody> {
        return call(REGISTER, player?.bearer, { input });
    }

    function unregister(
        player: TestPlayer,
        deviceId: string,
    ): Promise<WireBody> {
        return call(UNREGISTER, player.bearer, { deviceId });
    }

    function errorCodeOf(body: WireBody): string | undefined {
        return body.errors?.[0]?.extensions?.code;
    }

    function rawDevice(filter: Record<string, unknown>) {
        return devices.collection.findOne(filter);
    }

    function player(twitchId: string): Promise<TestPlayer> {
        return createPlayer(harness, { twitchId, withCharacter: false });
    }

    beforeAll(async () => {
        transport = new FakePushTransport();
        harness = await createCharactersTestApp({
            imports: [PushModule],
            overrides: [
                { token: PushTransport, useValue: transport },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
            ],
        });
        devices = harness.connection.model<PushDeviceDocument>(PushDevice.name);
        users = harness.connection.model<UserDocument>(User.name);
        await devices.init();
    });

    afterEach(async () => {
        transport.reset();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('registers the caller device and subscribes its token to the broadcast topic', async () => {
        const alice = await player('twitch-push-alice');

        const body = await register(alice);

        expect(body.errors).toBeUndefined();
        expect(body.data?.registerPushDevice).toBe(true);
        expect(await devices.countDocuments()).toBe(1);
        const raw = await rawDevice({ deviceId: 'dev-1' });
        expect(raw).toMatchObject({
            deviceId: 'dev-1',
            token: 'tok-a',
            platform: 'android',
        });
        expect(String(raw?.userId)).toBe(String(alice.user._id));
        expect((raw?.userId as Types.ObjectId)._bsontype).toBe('ObjectId');
        expect(transport.subscriptions).toEqual([
            { tokens: ['tok-a'], topic: STREAMER_LIVE },
        ]);
    });

    it('refreshes the same device instead of duplicating it (SC1)', async () => {
        const alice = await player('twitch-push-alice');

        await register(alice);
        const first = await rawDevice({ deviceId: 'dev-1' });
        await pause(LAST_SEEN_GAP_MS);
        const second = await register(alice);

        expect(second.data?.registerPushDevice).toBe(true);
        expect(await devices.countDocuments()).toBe(1);
        const refreshed = await rawDevice({ deviceId: 'dev-1' });
        expect(
            (refreshed?.lastSeenAt as Date).getTime(),
        ).toBeGreaterThanOrEqual((first?.lastSeenAt as Date).getTime());
    });

    it('replaces the token of a known device and unsubscribes the old one', async () => {
        const alice = await player('twitch-push-alice');

        await register(alice);
        await register(alice, deviceInput({ token: 'tok-b' }));

        expect(await devices.countDocuments()).toBe(1);
        expect(await rawDevice({ deviceId: 'dev-1' })).toMatchObject({
            token: 'tok-b',
        });
        expect(transport.unsubscriptions).toEqual([
            { tokens: ['tok-a'], topic: STREAMER_LIVE },
        ]);
    });

    it('moves a token claimed by another user to the new owner', async () => {
        const alice = await player('twitch-push-alice');
        const bruno = await player('twitch-push-bruno');

        await register(alice);
        await register(bruno, deviceInput({ deviceId: 'dev-9' }));

        expect(await devices.countDocuments()).toBe(1);
        const raw = await rawDevice({ token: 'tok-a' });
        expect(String(raw?.userId)).toBe(String(bruno.user._id));
        expect(raw?.deviceId).toBe('dev-9');
    });

    it('keeps one row when the same device registers concurrently', async () => {
        const alice = await player('twitch-push-alice');

        const results = await Promise.all([
            register(alice, deviceInput({ token: 'tok-1' })),
            register(alice, deviceInput({ token: 'tok-2' })),
        ]);

        expect(results.map((body) => body.data?.registerPushDevice)).toEqual([
            true,
            true,
        ]);
        expect(await devices.countDocuments({ deviceId: 'dev-1' })).toBe(1);
    });

    it('rejects a malformed device id or token without writing', async () => {
        const alice = await player('twitch-push-alice');

        const badDevice = await register(
            alice,
            deviceInput({ deviceId: 'bad id' }),
        );
        const badToken = await register(
            alice,
            deviceInput({ token: 'tok en' }),
        );

        expect(errorCodeOf(badDevice)).toBe('PUSH_INVALID_DEVICE_ID');
        expect(errorCodeOf(badToken)).toBe('PUSH_INVALID_TOKEN');
        expect(await devices.countDocuments()).toBe(0);
    });

    it('requires a bearer', async () => {
        expect(errorCodeOf(await register(null))).toBe('UNAUTHENTICATED');
    });

    it('rejects the bearer of a deleted user without writing', async () => {
        const alice = await player('twitch-push-alice');
        await users.deleteOne({ _id: alice.user._id });

        expect(errorCodeOf(await register(alice))).toBe('UNAUTHENTICATED');
        expect(await devices.countDocuments()).toBe(0);
    });

    it('registers the device even when topic management fails', async () => {
        const alice = await player('twitch-push-alice');
        transport.failTopicManagement(new Error('boom'));

        const body = await register(alice);

        expect(body.data?.registerPushDevice).toBe(true);
        expect(await devices.countDocuments({ deviceId: 'dev-1' })).toBe(1);
    });

    it('unregisters the caller device idempotently and unsubscribes its token', async () => {
        const alice = await player('twitch-push-alice');
        await register(alice);

        const first = await unregister(alice, 'dev-1');

        expect(first.data?.unregisterPushDevice).toBe(true);
        expect(await devices.countDocuments()).toBe(0);
        expect(transport.unsubscriptions).toContainEqual({
            tokens: ['tok-a'],
            topic: STREAMER_LIVE,
        });
        const again = await unregister(alice, 'dev-1');
        expect(again.errors).toBeUndefined();
        expect(again.data?.unregisterPushDevice).toBe(true);
    });

    it('unregisters only the caller row for a shared device id', async () => {
        const alice = await player('twitch-push-alice');
        const bruno = await player('twitch-push-bruno');
        await register(alice, deviceInput({ deviceId: 'dev-x' }));
        await register(
            bruno,
            deviceInput({ deviceId: 'dev-x', token: 'tok-bruno' }),
        );

        await unregister(alice, 'dev-x');

        expect(await devices.countDocuments()).toBe(1);
        const raw = await rawDevice({ deviceId: 'dev-x' });
        expect(String(raw?.userId)).toBe(String(bruno.user._id));
    });

    it('rejects a malformed device id on unregister', async () => {
        const alice = await player('twitch-push-alice');

        expect(errorCodeOf(await unregister(alice, 'bad id'))).toBe(
            'PUSH_INVALID_DEVICE_ID',
        );
    });

    it('never exposes tokens or devices through the schema', async () => {
        const alice = await player('twitch-push-alice');

        const userType = await call(USER_FIELDS);
        const names = (
            userType.data?.__type.fields as Array<{ name: string }>
        ).map((field) => field.name);
        expect(names.filter((name) => /token|device|push/i.test(name))).toEqual(
            [],
        );
        const deviceType = await call(PUSH_DEVICE_TYPE);
        expect(deviceType.data?.__type).toBeNull();
        const me = await call(ME, alice.bearer);
        expect(me.errors).toBeUndefined();
    });
});
