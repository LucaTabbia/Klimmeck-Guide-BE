import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { s256Challenge } from 'src/auth/crypto/token-crypto';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { persistUser } from '../../test/fixtures';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_TOKEN_TTL_MS = 900 * 1000;
const CLOCK_TOLERANCE_MS = 5000;
const TWITCH_ID = 'twitch-session-1';

interface AccessClaims {
    sub: string;
    twitchId: string;
    role: RoleType;
    sid: string;
}

const jwt = new JwtService();

function decodeClaims(accessToken: string): AccessClaims {
    return jwt.decode<AccessClaims>(accessToken);
}

describe('AuthSessionService (harness)', () => {
    let harness: AuthTestApp;
    let service: AuthSessionService;
    let users: Model<UserDocument>;
    let sessions: Model<SessionDocument>;
    let user: UserDocument;

    beforeAll(async () => {
        harness = await createAuthTestApp();
        service = harness.app.get(AuthSessionService);
        users = harness.connection.model<UserDocument>(User.name);
        sessions = harness.connection.model<SessionDocument>(Session.name);
    });

    beforeEach(async () => {
        user = await persistUser(users, {
            twitchId: TWITCH_ID,
            role: RoleType.adventurer,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function identityOf(accessToken: string): AuthIdentity {
        const claims = decodeClaims(accessToken);
        return {
            userId: claims.sub,
            twitchId: claims.twitchId,
            role: claims.role,
            sessionId: claims.sid,
        };
    }

    describe('issueForUser', () => {
        it('issues an access token bound to a persisted session plus an opaque refresh token', async () => {
            const before = Date.now();

            const session = await service.issueForUser(user);

            const claims = decodeClaims(session.accessToken);
            expect(claims.sub).toBe(String(user._id));
            expect(claims.twitchId).toBe(TWITCH_ID);
            expect(claims.role).toBe(RoleType.adventurer);
            expect(await sessions.exists({ _id: claims.sid })).not.toBeNull();
            expect(
                Math.abs(
                    session.accessTokenExpiresAt.getTime() -
                        (before + ACCESS_TOKEN_TTL_MS),
                ),
            ).toBeLessThan(CLOCK_TOLERANCE_MS);
            expect(session.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(session.user.twitchId).toBe(TWITCH_ID);
        });
    });

    describe('exchangeLoginTicket', () => {
        it('redeems a ticket once into a session for its user', async () => {
            const ticket = await harness.app
                .get(LoginTicketService)
                .issue(String(user._id), s256Challenge(VERIFIER));

            const session = await service.exchangeLoginTicket(ticket, VERIFIER);

            expect(session.user.twitchId).toBe(TWITCH_ID);
            expect(decodeClaims(session.accessToken).sub).toBe(
                String(user._id),
            );
            await expect(
                service.exchangeLoginTicket(ticket, VERIFIER),
            ).rejects.toMatchObject({
                code: AuthErrorCode.LOGIN_TICKET_INVALID,
            });
        });

        it('rejects a valid ticket whose user no longer exists', async () => {
            const ticket = await harness.app
                .get(LoginTicketService)
                .issue(String(user._id), s256Challenge(VERIFIER));
            await users.deleteOne({ _id: user._id }).exec();

            await expect(
                service.exchangeLoginTicket(ticket, VERIFIER),
            ).rejects.toMatchObject({
                code: AuthErrorCode.LOGIN_TICKET_INVALID,
            });
        });
    });

    describe('refresh', () => {
        it('rotates the refresh token keeping the same session', async () => {
            const issued = await service.issueForUser(user);

            const refreshed = await service.refresh(issued.refreshToken);

            expect(refreshed.refreshToken).not.toBe(issued.refreshToken);
            expect(refreshed.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(decodeClaims(refreshed.accessToken).sid).toBe(
                decodeClaims(issued.accessToken).sid,
            );
        });

        it('re-reads the role from the database on every refresh (D-10)', async () => {
            const issued = await service.issueForUser(user);
            await users
                .updateOne({ _id: user._id }, { role: RoleType.innkeeper })
                .exec();

            const refreshed = await service.refresh(issued.refreshToken);

            expect(decodeClaims(refreshed.accessToken).role).toBe(
                RoleType.innkeeper,
            );
            expect(refreshed.user.role).toBe(RoleType.innkeeper);
        });

        it('revokes the session when its user has been deleted', async () => {
            const issued = await service.issueForUser(user);
            const { sid } = decodeClaims(issued.accessToken);
            await users.deleteOne({ _id: user._id }).exec();

            await expect(
                service.refresh(issued.refreshToken),
            ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_REVOKED });
            const stored = await sessions.findById(sid).exec();
            expect(stored?.revokedAt).toBeInstanceOf(Date);
        });

        it('rejects an unknown refresh token as SESSION_EXPIRED', async () => {
            await expect(
                service.refresh('unknown-refresh-token'),
            ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
        });
    });

    describe('logout', () => {
        it('revokes the current session so its refresh token stops working', async () => {
            const issued = await service.issueForUser(user);
            const identity = identityOf(issued.accessToken);

            await expect(service.logout(identity)).resolves.toBe(true);

            const stored = await sessions.findById(identity.sessionId).exec();
            expect(stored?.revokedAt).toBeInstanceOf(Date);
            await expect(
                service.refresh(issued.refreshToken),
            ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_REVOKED });
        });

        it('accepts a dev identity without a session', async () => {
            await expect(
                service.logout({
                    userId: String(user._id),
                    twitchId: TWITCH_ID,
                    role: RoleType.adventurer,
                }),
            ).resolves.toBe(true);
        });
    });
});
