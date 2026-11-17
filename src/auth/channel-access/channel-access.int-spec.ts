import { Model } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { AuthException } from 'src/auth/auth.exception';
import { StreamerCredentialStore } from 'src/auth/channel-access/streamer-credential.store';
import {
    StreamerCredential,
    StreamerCredentialDocument,
} from 'src/auth/channel-access/streamer-credential.model';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { UserRoleChangesPublisher } from 'src/auth/session/user-role-changes.publisher';
import {
    TwitchOAuthError,
    TwitchRefreshRejectedError,
} from 'src/auth/twitch/twitch-oauth.client';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    FAKE_STREAMER_ACCESS_TOKEN,
    FAKE_STREAMER_REFRESH_TOKEN,
} from '../../../test/auth/fake-twitch-oauth.client';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildTestAuthConfig } from '../../../test/auth/test-auth-config';
import { persistUser } from '../../../test/fixtures';

const BROADCASTER_ID = '999000999';
const VIEWER_ID = '111000111';
const STORED_REFRESH_TOKEN = 'stored-streamer-refresh-token';
const RECHECK_SECONDS = 3600;
const STREAMER_TOKEN_SECONDS = 4 * 3600;

describe('channel access re-check at the session refresh (harness)', () => {
    let harness: AuthTestApp;
    let clock: FixedClock;
    let service: AuthSessionService;
    let store: StreamerCredentialStore;
    let users: Model<UserDocument>;
    let sessions: Model<SessionDocument>;
    let credentials: Model<StreamerCredentialDocument>;
    let viewer: UserDocument;

    beforeAll(async () => {
        clock = new FixedClock();
        const twitch = buildTestAuthConfig().twitch;
        harness = await createAuthTestApp({
            clock,
            authConfig: {
                twitch: twitch && {
                    ...twitch,
                    followGateBroadcasterId: BROADCASTER_ID,
                },
            },
            overrides: [{ token: UserRoleChangesPublisher, useValue: {} }],
        });
        service = harness.app.get(AuthSessionService);
        store = harness.app.get(StreamerCredentialStore);
        users = harness.connection.model<UserDocument>(User.name);
        sessions = harness.connection.model<SessionDocument>(Session.name);
        credentials = harness.connection.model<StreamerCredentialDocument>(
            StreamerCredential.name,
        );
    });

    beforeEach(async () => {
        viewer = await persistUser(users, { twitchId: VIEWER_ID });
        harness.twitch.streamerTokenSeconds = STREAMER_TOKEN_SECONDS;
        await store.save(BROADCASTER_ID, STORED_REFRESH_TOKEN);
    });

    afterEach(async () => {
        await harness.clearDatabase();
        // la cache del token dello streamer vive nel processo: scade prima del prossimo test
        clock.advanceSeconds(STREAMER_TOKEN_SECONDS + 1);
    });

    afterAll(async () => {
        await harness.close();
    });

    async function refreshError(refreshToken: string): Promise<AuthException> {
        const error: unknown = await service
            .refresh(refreshToken)
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(AuthException);
        return error as AuthException;
    }

    it('keeps a follower in, asking Twitch with the streamer token', async () => {
        const issued = await service.issueForUser(viewer);

        const refreshed = await service.refresh(issued.refreshToken);

        expect(refreshed.user.twitchId).toBe(VIEWER_ID);
        expect(harness.twitch.refreshedWith).toEqual([STORED_REFRESH_TOKEN]);
        expect(harness.twitch.followerQueries).toEqual([
            {
                accessToken: FAKE_STREAMER_ACCESS_TOKEN,
                userId: VIEWER_ID,
                broadcasterId: BROADCASTER_ID,
            },
        ]);
    });

    it('asks again only after the re-check interval', async () => {
        const issued = await service.issueForUser(viewer);
        const first = await service.refresh(issued.refreshToken);

        clock.advanceSeconds(RECHECK_SECONDS - 1);
        const second = await service.refresh(first.refreshToken);
        expect(harness.twitch.followerQueries).toHaveLength(1);

        clock.advanceSeconds(1);
        await service.refresh(second.refreshToken);
        expect(harness.twitch.followerQueries).toHaveLength(2);
    });

    it('reuses the streamer access token until it is about to expire', async () => {
        const issued = await service.issueForUser(viewer);
        const first = await service.refresh(issued.refreshToken);

        clock.advanceSeconds(RECHECK_SECONDS);
        const second = await service.refresh(first.refreshToken);
        expect(harness.twitch.refreshedWith).toHaveLength(1);

        clock.advanceSeconds(STREAMER_TOKEN_SECONDS);
        await service.refresh(second.refreshToken);
        expect(harness.twitch.refreshedWith).toEqual([
            STORED_REFRESH_TOKEN,
            FAKE_STREAMER_REFRESH_TOKEN,
        ]);
    });

    it('stores the rotated streamer refresh token sealed, never in clear', async () => {
        const issued = await service.issueForUser(viewer);

        await service.refresh(issued.refreshToken);

        expect(await store.load(BROADCASTER_ID)).toBe(
            FAKE_STREAMER_REFRESH_TOKEN,
        );
        const stored = await credentials.find().lean().exec();
        expect(stored).toHaveLength(1);
        expect(JSON.stringify(stored)).not.toContain(
            FAKE_STREAMER_REFRESH_TOKEN,
        );
    });

    it('logs out who stopped following: every session revoked with accessLost', async () => {
        const issued = await service.issueForUser(viewer);
        harness.twitch.isFollower = false;

        const error = await refreshError(issued.refreshToken);

        expect(error.code).toBe(AuthErrorCode.SESSION_REVOKED);
        expect(error.extensions.reason).toBe(SessionRevokeReason.accessLost);
        const stored = await sessions.find({ userId: viewer._id }).exec();
        expect(stored).toHaveLength(1);
        expect(stored[0].revokedAt).not.toBeNull();
        expect(stored[0].revokeReason).toBe(SessionRevokeReason.accessLost);
    });

    it('keeps refusing the revoked session with the same reason', async () => {
        const issued = await service.issueForUser(viewer);
        harness.twitch.isFollower = false;
        await refreshError(issued.refreshToken);
        harness.twitch.isFollower = true;

        const error = await refreshError(issued.refreshToken);

        expect(error.extensions.reason).toBe(SessionRevokeReason.accessLost);
    });

    it('checks again at the first refresh after a new login of who was logged out', async () => {
        const issued = await service.issueForUser(viewer);
        await service.refresh(issued.refreshToken);
        clock.advanceSeconds(RECHECK_SECONDS);
        harness.twitch.isFollower = false;
        const lost = await service.issueForUser(viewer);
        await refreshError(lost.refreshToken);

        harness.twitch.isFollower = true;
        const back = await service.issueForUser(viewer);
        await service.refresh(back.refreshToken);

        expect(harness.twitch.followerQueries).toHaveLength(3);
    });

    it('never checks the broadcaster', async () => {
        const streamer = await persistUser(users, { twitchId: BROADCASTER_ID });
        harness.twitch.isFollower = false;
        const issued = await service.issueForUser(streamer);

        await service.refresh(issued.refreshToken);

        expect(harness.twitch.followerQueries).toEqual([]);
    });

    it('lets everyone in while the streamer has not granted the followers scope', async () => {
        await store.clear(BROADCASTER_ID);
        harness.twitch.isFollower = false;
        const issued = await service.issueForUser(viewer);

        await service.refresh(issued.refreshToken);

        expect(harness.twitch.refreshedWith).toEqual([]);
        expect(harness.twitch.followerQueries).toEqual([]);
    });

    it('lets the viewer in when Twitch does not answer, and asks again at the next refresh', async () => {
        const issued = await service.issueForUser(viewer);
        harness.twitch.followerError = new TwitchOAuthError(
            'Twitch follower check failed with status 503',
        );
        const first = await service.refresh(issued.refreshToken);

        harness.twitch.followerError = null;
        await service.refresh(first.refreshToken);

        expect(harness.twitch.followerQueries).toHaveLength(2);
    });

    it('lets the viewer in when the streamer token cannot be renewed for now', async () => {
        const issued = await service.issueForUser(viewer);
        harness.twitch.refreshError = new TwitchOAuthError(
            'Twitch token refresh request failed',
        );

        await service.refresh(issued.refreshToken);

        expect(harness.twitch.followerQueries).toEqual([]);
        expect(await store.load(BROADCASTER_ID)).toBe(STORED_REFRESH_TOKEN);
    });

    it('forgets a streamer refresh token that Twitch rejects, letting the viewer in', async () => {
        const issued = await service.issueForUser(viewer);
        harness.twitch.refreshError = new TwitchRefreshRejectedError(
            'Twitch token refresh failed with status 400',
        );

        await service.refresh(issued.refreshToken);

        expect(harness.twitch.followerQueries).toEqual([]);
        expect(await store.load(BROADCASTER_ID)).toBeNull();
    });

    it('renews the streamer token after Twitch refuses the cached one', async () => {
        const issued = await service.issueForUser(viewer);
        const first = await service.refresh(issued.refreshToken);
        clock.advanceSeconds(RECHECK_SECONDS);
        harness.twitch.followerError = new TwitchOAuthError(
            'Twitch follower check failed with status 401',
        );
        const second = await service.refresh(first.refreshToken);

        harness.twitch.followerError = null;
        await service.refresh(second.refreshToken);

        expect(harness.twitch.refreshedWith).toHaveLength(2);
    });
});

describe('channel access re-check with the follow gate off (harness)', () => {
    let harness: AuthTestApp;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            overrides: [{ token: UserRoleChangesPublisher, useValue: {} }],
        });
    });

    afterAll(async () => {
        await harness.close();
    });

    it('never asks Twitch', async () => {
        const users = harness.connection.model<UserDocument>(User.name);
        const service = harness.app.get(AuthSessionService);
        harness.twitch.isFollower = false;
        const issued = await service.issueForUser(
            await persistUser(users, { twitchId: VIEWER_ID }),
        );

        await service.refresh(issued.refreshToken);

        expect(harness.twitch.followerQueries).toEqual([]);
    });
});
