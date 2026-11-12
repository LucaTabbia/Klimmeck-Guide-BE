import { JwtService } from '@nestjs/jwt';
import type { Model } from 'mongoose';
import WebSocket from 'ws';
import { AuthSessionService } from 'src/auth/auth-session.service';
import type { AuthSession } from 'src/auth/dto/auth-session.model';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { SessionService } from 'src/auth/session/session.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    openAcknowledgedSocket,
} from '../../../test/auth/ws-test-client';
import { persistUser } from '../../../test/fixtures';
import {
    flushRoleWatcher,
    primeRoleWatcher,
    waitForRevocation,
} from '../../../test/harness/role-watcher';

// valori del contratto FE asseriti letterali: un cambio silenzioso delle costanti deve rompere il test
const SESSION_REVOKED_CLOSE_CODE = 4409;
const TWITCH_ID = 'twitch-role-change';
const OTHER_TWITCH_ID = 'twitch-role-bystander';
// boot più il priming nel caso peggiore (25 tentativi da 200 ms)
const SETUP_TIMEOUT_MS = 15_000;

function sessionIdOf({ accessToken }: AuthSession): string {
    return new JwtService().decode<{ sid: string }>(accessToken).sid;
}

describe('UserRoleChangesPublisher (change stream)', () => {
    let harness: AuthTestApp;
    let users: Model<UserDocument>;
    let sessions: Model<SessionDocument>;
    let user: UserDocument;
    let openSockets: WebSocket[] = [];

    beforeAll(async () => {
        harness = await createAuthTestApp();
        users = harness.connection.model<UserDocument>(User.name);
        sessions = harness.connection.model<SessionDocument>(Session.name);
        await primeRoleWatcher(harness);
    }, SETUP_TIMEOUT_MS);

    beforeEach(async () => {
        user = await persistUser(users, {
            twitchId: TWITCH_ID,
            role: RoleType.adventurer,
        });
    });

    afterEach(async () => {
        openSockets.forEach((socket) => socket.terminate());
        openSockets = [];
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function login(): Promise<AuthSession> {
        return harness.app.get(AuthSessionService).issueForUser(user);
    }

    async function createSession(userId: string): Promise<string> {
        const { sessionId } = await harness.app
            .get(SessionService)
            .create(userId);
        return sessionId;
    }

    async function readRevocation(sessionId: string) {
        const session = await sessions.findById(sessionId).lean().exec();
        return {
            revokedAt: session?.revokedAt ?? null,
            revokeReason: session?.revokeReason ?? null,
        };
    }

    async function setRoleByHand(role: RoleType): Promise<void> {
        await users.updateOne({ _id: user._id }, { $set: { role } }).exec();
    }

    it('revokes every session of a user whose role is changed by hand with roleChanged (D-06)', async () => {
        const issuedSessionId = sessionIdOf(await login());
        const createdSessionId = await createSession(user.id);

        await setRoleByHand(RoleType.guard);

        const revocations = await Promise.all(
            [issuedSessionId, createdSessionId].map((sessionId) =>
                waitForRevocation(harness, sessionId),
            ),
        );
        expect(revocations.map(({ revokeReason }) => revokeReason)).toEqual([
            SessionRevokeReason.roleChanged,
            SessionRevokeReason.roleChanged,
        ]);
    });

    it('closes the live socket of the user with 4409 roleChanged (D-03, D-06)', async () => {
        const session = await login();
        const { socket, closed } = await openAcknowledgedSocket(
            graphqlWsUrl(harness.port),
            { Authorization: `Bearer ${session.accessToken}` },
        );
        openSockets.push(socket);

        await setRoleByHand(RoleType.guard);

        await expect(closed).resolves.toEqual({
            code: SESSION_REVOKED_CLOSE_CODE,
            reason: 'roleChanged',
            acknowledged: true,
        });
    });

    it('revokes the sessions when upsertWithRole changes the role of an existing user (D-06)', async () => {
        const sessionId = await createSession(user.id);

        await harness.app
            .get(UsersService)
            .upsertWithRole(TWITCH_ID, RoleType.guard);

        await expect(
            waitForRevocation(harness, sessionId),
        ).resolves.toMatchObject({
            revokeReason: SessionRevokeReason.roleChanged,
        });
    });

    it('leaves the sessions intact when upsertWithRole writes the same role (D-06)', async () => {
        const sessionId = await createSession(user.id);

        await harness.app
            .get(UsersService)
            .upsertWithRole(TWITCH_ID, RoleType.adventurer);
        await flushRoleWatcher(harness);

        expect(await readRevocation(sessionId)).toEqual({
            revokedAt: null,
            revokeReason: null,
        });
    });

    it('leaves the sessions intact when the same role is written by hand (D-06)', async () => {
        const sessionId = await createSession(user.id);

        await setRoleByHand(RoleType.adventurer);
        await flushRoleWatcher(harness);

        expect(await readRevocation(sessionId)).toEqual({
            revokedAt: null,
            revokeReason: null,
        });
    });

    it('leaves the sessions intact when another field changes (D-06)', async () => {
        const sessionId = await createSession(user.id);

        await users
            .updateOne({ _id: user._id }, { $set: { twitchPoints: 42 } })
            .exec();
        await flushRoleWatcher(harness);

        expect(await readRevocation(sessionId)).toEqual({
            revokedAt: null,
            revokeReason: null,
        });
    });

    it('leaves the sessions of other users and the already revoked ones as they were (D-06)', async () => {
        const other = await persistUser(users, {
            twitchId: OTHER_TWITCH_ID,
            role: RoleType.adventurer,
        });
        const otherSessionId = await createSession(other.id);
        const loggedOutSessionId = await createSession(user.id);
        await harness.app
            .get(SessionService)
            .revoke(loggedOutSessionId, SessionRevokeReason.userLogout);
        const loggedOut = await readRevocation(loggedOutSessionId);
        const activeSessionId = await createSession(user.id);

        await setRoleByHand(RoleType.guard);
        await waitForRevocation(harness, activeSessionId);
        await flushRoleWatcher(harness);

        expect(await readRevocation(loggedOutSessionId)).toEqual(loggedOut);
        expect(loggedOut.revokeReason).toBe(SessionRevokeReason.userLogout);
        expect(await readRevocation(otherSessionId)).toEqual({
            revokedAt: null,
            revokeReason: null,
        });
    });
});
