import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model, Types } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Clock } from 'src/auth/clock';
import { sha256Hex } from 'src/auth/crypto/token-crypto';
import {
    Session,
    SessionDocument,
    SessionSchema,
} from 'src/auth/session/session.model';
import { SessionService } from 'src/auth/session/session.service';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildTestAuthConfig } from '../../../test/auth/test-auth-config';
import { buildSession, persistSession } from '../../../test/fixtures';

const SessionModel: Model<SessionDocument> =
    mongoose.models.Session || mongoose.model(Session.name, SessionSchema);

const USER_ID = '64b0000000000000000000b1';
const REFRESH_TOKEN_TTL_MS = 2_592_000 * 1000;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

describe('SessionService (replSet)', () => {
    let service: SessionService;
    let clock: FixedClock;

    beforeAll(async () => {
        await SessionModel.init();
    });

    beforeEach(async () => {
        clock = new FixedClock();
        const moduleRef = await Test.createTestingModule({
            providers: [
                SessionService,
                {
                    provide: getModelToken(Session.name),
                    useValue: SessionModel,
                },
                { provide: Clock, useValue: clock },
                { provide: AUTH_CONFIG, useValue: buildTestAuthConfig() },
            ],
        }).compile();
        service = moduleRef.get(SessionService);
    });

    describe('create', () => {
        it('issues an opaque refresh token bound to a new session', async () => {
            const issued = await service.create(USER_ID);

            expect(issued.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(issued.userId).toBe(USER_ID);
            expect(Types.ObjectId.isValid(issued.sessionId)).toBe(true);
        });

        it('stores only the SHA-256 hash of the refresh token', async () => {
            const issued = await service.create(USER_ID);

            const stored = await SessionModel.findById(issued.sessionId)
                .lean()
                .exec();

            expect(stored?.refreshTokenHash).toBe(
                sha256Hex(issued.refreshToken),
            );
            expect(JSON.stringify(stored)).not.toContain(issued.refreshToken);
        });

        it('sets a 30-day expiry and no rotation or revocation', async () => {
            const issued = await service.create(USER_ID);

            const stored = await SessionModel.findById(issued.sessionId).exec();

            expect(stored?.expiresAt.getTime()).toBe(
                clock.now().getTime() + REFRESH_TOKEN_TTL_MS,
            );
            expect(stored?.revokedAt).toBeNull();
            expect(stored?.rotatedAt).toBeNull();
            expect(stored?.userId.toString()).toBe(USER_ID);
        });

        it('allows multiple sessions for the same user (multi-device)', async () => {
            const first = await service.create(USER_ID);
            const second = await service.create(USER_ID);

            expect(first.sessionId).not.toBe(second.sessionId);
            expect(first.refreshToken).not.toBe(second.refreshToken);
            expect(await SessionModel.countDocuments({ userId: USER_ID })).toBe(
                2,
            );
        });
    });

    describe('revoke', () => {
        it('marks the session as revoked at the current time', async () => {
            const issued = await service.create(USER_ID);
            clock.advanceSeconds(5);

            await service.revoke(issued.sessionId);

            const stored = await SessionModel.findById(issued.sessionId).exec();
            expect(stored?.revokedAt?.getTime()).toBe(clock.now().getTime());
        });

        it('does not throw for an unknown session id', async () => {
            await expect(
                service.revoke(new Types.ObjectId().toString()),
            ).resolves.toBeUndefined();
        });

        it('does not throw for a malformed session id', async () => {
            await expect(service.revoke('not-an-object-id')).resolves.toBe(
                undefined,
            );
        });
    });

    describe('findRotatable', () => {
        it('resolves the session of a rotatable token without rotating it', async () => {
            const t0 = await service.create(USER_ID);

            const found = await service.findRotatable(t0.refreshToken);

            expect(found).toEqual({ sessionId: t0.sessionId, userId: USER_ID });
            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t0.refreshToken));
            expect(stored?.rotatedAt).toBeNull();
        });

        it('rejects a token that was never issued with SESSION_EXPIRED', async () => {
            await expect(
                service.findRotatable('never-issued-refresh-token'),
            ).rejects.toMatchObject({ code: AuthErrorCode.SESSION_EXPIRED });
        });
    });

    describe('rotate', () => {
        const sessionExpired = { code: AuthErrorCode.SESSION_EXPIRED };
        const sessionRevoked = { code: AuthErrorCode.SESSION_REVOKED };

        it('issues a new token and slides the expiry on an active session', async () => {
            const t0 = await service.create(USER_ID);
            clock.advanceSeconds(60);

            const t1 = await service.rotate(t0.refreshToken);

            expect(t1.refreshToken).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(t1.refreshToken).not.toBe(t0.refreshToken);
            expect(t1.sessionId).toBe(t0.sessionId);
            expect(t1.userId).toBe(USER_ID);
            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t1.refreshToken));
            expect(stored?.previousRefreshTokenHash).toBe(
                sha256Hex(t0.refreshToken),
            );
            expect(stored?.rotatedAt?.getTime()).toBe(clock.now().getTime());
            expect(stored?.expiresAt.getTime()).toBe(
                clock.now().getTime() + REFRESH_TOKEN_TTL_MS,
            );
        });

        it('chains rotations: the latest token rotates again', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(60);

            const t2 = await service.rotate(t1.refreshToken);

            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t2.refreshToken));
            expect(stored?.previousRefreshTokenHash).toBe(
                sha256Hex(t1.refreshToken),
            );
        });

        it('grace: reusing the previous token within 30s issues a fresh token', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            const firstRotationAt = clock.now().getTime();
            clock.advanceSeconds(10);

            const t2 = await service.rotate(t0.refreshToken);

            expect(t2.refreshToken).not.toBe(t1.refreshToken);
            expect(t2.sessionId).toBe(t0.sessionId);
            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t2.refreshToken));
            expect(stored?.previousRefreshTokenHash).toBe(
                sha256Hex(t0.refreshToken),
            );
            expect(stored?.rotatedAt?.getTime()).toBe(firstRotationAt);
            expect(stored?.revokedAt).toBeNull();
            await expect(service.rotate(t1.refreshToken)).rejects.toMatchObject(
                sessionExpired,
            );
        });

        it('reuse: the previous token after 30s revokes the whole session', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(31);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );

            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.revokedAt?.getTime()).toBe(clock.now().getTime());
            await expect(service.rotate(t1.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );
        });

        it('rejects a token that was never issued with SESSION_EXPIRED', async () => {
            await expect(
                service.rotate('never-issued-refresh-token'),
            ).rejects.toMatchObject(sessionExpired);
        });

        it('rejects the token of an expired session with SESSION_EXPIRED', async () => {
            await persistSession(SessionModel, {
                refreshTokenHash: sha256Hex('expired-session-token'),
                expiresAt: new Date(clock.now().getTime() - 1000),
            });

            await expect(
                service.rotate('expired-session-token'),
            ).rejects.toMatchObject(sessionExpired);
        });

        it('rejects the current token of a revoked session with SESSION_REVOKED', async () => {
            const t0 = await service.create(USER_ID);
            await service.revoke(t0.sessionId);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );
        });

        it('concurrent: two rotations of the same token leave one session with one current token', async () => {
            const t0 = await service.create(USER_ID);

            const [first, second] = await Promise.all([
                service.rotate(t0.refreshToken),
                service.rotate(t0.refreshToken),
            ]);

            expect(await SessionModel.countDocuments()).toBe(1);
            const stored = await SessionModel.findById(t0.sessionId).exec();
            const issuedHashes = [first, second].map((issued) =>
                sha256Hex(issued.refreshToken),
            );
            expect(
                issuedHashes.filter(
                    (hash) => hash === stored?.refreshTokenHash,
                ),
            ).toHaveLength(1);
            expect(stored?.revokedAt).toBeNull();
        });
    });

    describe('schema', () => {
        it('declares a TTL index on expiresAt and a unique index on refreshTokenHash', () => {
            const indexes = SessionModel.schema.indexes();

            expect(indexes).toContainEqual([
                { expiresAt: 1 },
                expect.objectContaining({ expireAfterSeconds: 0 }),
            ]);
            expect(indexes).toContainEqual([
                { refreshTokenHash: 1 },
                expect.objectContaining({ unique: true }),
            ]);
        });
    });

    describe('session fixture', () => {
        it('builds a session valid against the schema', () => {
            const document = new SessionModel(buildSession());

            expect(document.validateSync()).toBeUndefined();
        });

        it('persists a session with overrides', async () => {
            const persisted = await persistSession(SessionModel, {
                refreshTokenHash: sha256Hex('another-token'),
            });

            const stored = await SessionModel.findById(persisted._id).exec();
            expect(stored?.refreshTokenHash).toBe(sha256Hex('another-token'));
        });
    });
});
