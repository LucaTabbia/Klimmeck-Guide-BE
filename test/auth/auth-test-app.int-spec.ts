import { Module } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User } from 'src/models/user.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { createPlayer } from '../authz/player-fixture';
import { AuthProbeResolver } from './auth-probe.resolver';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from './auth-test-app';
import { createAuthenticatedUser } from './test-tokens';
import { graphqlWsUrl, openSubscription, withTimeout } from './ws-test-client';

const HARNESS_PROBE = 'HARNESS_PROBE';

@Module({
    providers: [{ provide: HARNESS_PROBE, useValue: 'original' }],
    exports: [HARNESS_PROBE],
})
class HarnessProbeModule {}

describe('createAuthTestApp options', () => {
    let harness: AuthTestApp | undefined;

    afterEach(async () => {
        await harness?.close();
        harness = undefined;
    });

    it('mounts the feature modules passed via imports', async () => {
        harness = await createAuthTestApp({ imports: [HarnessProbeModule] });

        expect(harness.app.get(HARNESS_PROBE, { strict: false })).toBe(
            'original',
        );
    });

    it('replaces a provider passed via overrides', async () => {
        harness = await createAuthTestApp({
            imports: [HarnessProbeModule],
            overrides: [{ token: HARNESS_PROBE, useValue: 'overridden' }],
        });

        expect(harness.app.get(HARNESS_PROBE, { strict: false })).toBe(
            'overridden',
        );
    });

    it('does not mount feature modules by default', async () => {
        const defaultHarness = await createAuthTestApp();
        harness = defaultHarness;

        expect(() =>
            defaultHarness.app.get(HARNESS_PROBE, { strict: false }),
        ).toThrow();
    });
});

describe('harness real-time helpers', () => {
    let harness: AuthTestApp;

    const ME_QUERY = 'query { me { role currentCharacter { id } } }';

    beforeAll(async () => {
        harness = await createAuthTestApp({ providers: [AuthProbeResolver] });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('resolves a working PUB_SUB from the base imports', async () => {
        const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        const live = pubSub.subscribe('userUpdated');
        const next = live.next();

        pubSub.publish('userUpdated', {
            userUpdated: { id: 'probe' } as unknown as User,
        });

        expect((await next).value).toEqual({ userUpdated: { id: 'probe' } });
        await live.return?.();
    });

    it('reads subscription results in sequence with openSubscription', async () => {
        const { bearer } = await createAuthenticatedUser(harness, {
            twitchId: 'twitch-ws-helper',
        });
        const subscription = openSubscription<{ authProbe: string }>(
            graphqlWsUrl(harness.port),
            { Authorization: bearer },
            { query: 'subscription { authProbe }' },
        );

        try {
            expect(await subscription.next()).toEqual({
                done: false,
                value: { data: { authProbe: 'twitch-ws-helper' } },
            });
            expect((await subscription.next()).done).toBe(true);
        } finally {
            await subscription.dispose();
        }
    });

    it('rejects a pending promise after the timeout with withTimeout', async () => {
        await expect(
            withTimeout(new Promise(() => undefined), 50),
        ).rejects.toThrow('timed out');
    });

    it('creates an adventurer owning a character with createPlayer', async () => {
        const { character, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-player-1',
        });

        const raw = await harness.connection
            .collection('users')
            .findOne({ twitchId: 'twitch-player-1' });
        expect(String(raw?.currentCharacter)).toBe(String(character?._id));

        const response = await graphqlRequest(
            harness.app,
            ME_QUERY,
            undefined,
            bearer,
        );
        expect(response.body.data.me).toEqual({
            role: 'adventurer',
            currentCharacter: { id: String(character?._id) },
        });
    });

    it('creates a player with an arbitrary role and no character', async () => {
        const { character, bearer } = await createPlayer(harness, {
            twitchId: 'twitch-innkeeper-1',
            role: RoleType.innkeeper,
            withCharacter: false,
        });

        expect(character).toBeNull();
        const response = await graphqlRequest(
            harness.app,
            ME_QUERY,
            undefined,
            bearer,
        );
        expect(response.body.data.me).toEqual({
            role: 'innkeeper',
            currentCharacter: null,
        });
    });
});
