import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthSessionService } from 'src/auth/auth-session.service';
import { s256Challenge, sha256Hex } from 'src/auth/crypto/token-crypto';
import { LoginTicketService } from 'src/auth/login-ticket/login-ticket.service';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import { AccessTokenService } from 'src/auth/token/access-token.service';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { UsersService } from 'src/users/users.service';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { FixedClock } from '../../test/auth/fixed-clock';
import { persistUser } from '../../test/fixtures';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACCESS_TOKEN_TTL_MS = 900 * 1000;
const CLOCK_TOLERANCE_MS = 5000;
const TWITCH_ID = 'twitch-session-1';
const BEYOND_GRACE_SECONDS = 31;
const LAST_SECOND_WITHIN_GRACE = 29;
const SLOW_USER_LOOKUP_SECONDS = 2;

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
    let clock: FixedClock;
    let service: AuthSessionService;
    let users: Model<UserDocument>;
    let sessions: Model<SessionDocument>;
    let user: UserDocument;

    beforeAll(async () => {
        clock = new FixedClock();
        harness = await createAuthTestApp({ clock });
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

        it.each([
            ['the user lookup', () => harness.app.get(UsersService), 'findOne'],
            [
                'the access token signature',
                () => harness.app.get(AccessTokenService),
                'sign',
            ],
        ] as const)(
            'keeps the presented token valid when %s fails transiently (WR-01)',
            async (_step, dependency, method) => {
                const issued = await service.issueForUser(user);
                const failure = jest
                    .spyOn(dependency(), method)
                    .mockRejectedValueOnce(new Error('transient failure'));

                await expect(
                    service.refresh(issued.refreshToken),
                ).rejects.toThrow('transient failure');
                failure.mockRestore();
                clock.advanceSeconds(BEYOND_GRACE_SECONDS);

                const retried = await service.refresh(issued.refreshToken);

                expect(retried.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
                expect(decodeClaims(retried.accessToken).sid).toBe(
                    decodeClaims(issued.accessToken).sid,
                );
            },
        );

        it('evaluates the grace window when the request arrives, not when the rotation is persisted (WR-04)', async () => {
            const t0 = await service.issueForUser(user);
            const { sid } = decodeClaims(t0.accessToken);
            await service.refresh(t0.refreshToken);
            clock.advanceSeconds(LAST_SECOND_WITHIN_GRACE);
            const usersService = harness.app.get(UsersService);
            const findOne = usersService.findOne.bind(usersService);
            const slowLookup = jest
                .spyOn(usersService, 'findOne')
                .mockImplementationOnce((id: string) => {
                    clock.advanceSeconds(SLOW_USER_LOOKUP_SECONDS);
                    return findOne(id);
                });

            const retried = await service.refresh(t0.refreshToken);
            slowLookup.mockRestore();

            expect(retried.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(decodeClaims(retried.accessToken).sid).toBe(sid);
            const stored = await sessions.findById(sid).exec();
            expect(stored?.revokedAt).toBeNull();
            expect(stored?.refreshTokenHash).toBe(
                sha256Hex(retried.refreshToken),
            );
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
