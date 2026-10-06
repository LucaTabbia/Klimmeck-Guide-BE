import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model, Types } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Clock } from 'src/auth/clock';
import {
    deriveRefreshToken,
    deriveRefreshTokenKey,
} from 'src/auth/crypto/refresh-token-derivation';
import { sha256Hex } from 'src/auth/crypto/token-crypto';
import {
    Session,
    SessionDocument,
    SessionSchema,
} from 'src/auth/session/session.model';
import { SessionService } from 'src/auth/session/session.service';
import { AUTH_CONFIG } from 'src/config/auth-config';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildTestAuthConfig,
    TEST_JWT_SECRET,
} from '../../../test/auth/test-auth-config';
import { buildSession, persistSession } from '../../../test/fixtures';

const SessionModel: Model<SessionDocument> =
    mongoose.models.Session || mongoose.model(Session.name, SessionSchema);

const USER_ID = '64b0000000000000000000b1';
const REFRESH_TOKEN_TTL_MS = 2_592_000 * 1000;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RETIRED_REFRESH_TOKENS_LIMIT = 10;
const REFRESH_TOKEN_KEY = deriveRefreshTokenKey(TEST_JWT_SECRET);
const ROTATED_JWT_SECRET = 'rotated-jwt-secret-0123456789abcdef-0123456789';
const IN_GRACE_RETRIES = 3;

describe('SessionService (replSet)', () => {
    let service: SessionService;
    let clock: FixedClock;

    beforeAll(async () => {
        await SessionModel.init();
    });

    async function buildService(jwtSecret: string): Promise<SessionService> {
        const moduleRef = await Test.createTestingModule({
            providers: [
                SessionService,
                {
                    provide: getModelToken(Session.name),
                    useValue: SessionModel,
                },
                { provide: Clock, useValue: clock },
                {
                    provide: AUTH_CONFIG,
                    useValue: buildTestAuthConfig({ jwtSecret }),
                },
            ],
        }).compile();
        return moduleRef.get(SessionService);
    }

    function readSession(sessionId: string) {
        return SessionModel.findById(sessionId).lean().exec();
    }

    function retiredEntry(token: string, retiredAt: Date) {
        return { hash: sha256Hex(token), retiredAt };
    }

    beforeEach(async () => {
        clock = new FixedClock();
        service = await buildService(TEST_JWT_SECRET);
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

        it('derives the refresh token from a random per-session seed and rotation 0 (D-35)', async () => {
            const issued = await service.create(USER_ID);

            const stored = await readSession(issued.sessionId);

            expect(stored?.rotationCount).toBe(0);
            expect(stored?.tokenSeed).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(issued.refreshToken).toBe(
                deriveRefreshToken(
                    REFRESH_TOKEN_KEY,
                    issued.sessionId,
                    0,
                    stored?.tokenSeed ?? '',
                ),
            );
        });

        it('uses a different seed for every session', async () => {
            const first = await service.create(USER_ID);
            const second = await service.create(USER_ID);

            const [firstStored, secondStored] = await Promise.all([
                readSession(first.sessionId),
                readSession(second.sessionId),
            ]);

            expect(firstStored?.tokenSeed).not.toBe(secondStored?.tokenSeed);
        });

        it('sets a 30-day expiry and no rotation or revocation', async () => {
            const issued = await service.create(USER_ID);

            const stored = await readSession(issued.sessionId);

            expect(stored?.expiresAt.getTime()).toBe(
                clock.now().getTime() + REFRESH_TOKEN_TTL_MS,
            );
            expect(stored?.revokedAt).toBeNull();
            expect(stored?.retiredRefreshTokens).toEqual([]);
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
            const stored = await readSession(t0.sessionId);
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t0.refreshToken));
            expect(stored?.rotationCount).toBe(0);
            expect(stored?.retiredRefreshTokens).toEqual([]);
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
            const stored = await readSession(t0.sessionId);
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t1.refreshToken));
            expect(stored?.expiresAt.getTime()).toBe(
                clock.now().getTime() + REFRESH_TOKEN_TTL_MS,
            );
            expect(stored?.rotationCount).toBe(1);
            expect(stored?.retiredRefreshTokens).toEqual([
                retiredEntry(t0.refreshToken, clock.now()),
            ]);
            expect(t1.refreshToken).toBe(
                deriveRefreshToken(
                    REFRESH_TOKEN_KEY,
                    t0.sessionId,
                    1,
                    stored?.tokenSeed ?? '',
                ),
            );
        });

        it('chains rotations: the latest token rotates again', async () => {
            const t0 = await service.create(USER_ID);
            const firstRotationAt = clock.now();
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(60);

            const t2 = await service.rotate(t1.refreshToken);

            const stored = await readSession(t0.sessionId);
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t2.refreshToken));
            expect(stored?.retiredRefreshTokens).toEqual([
                retiredEntry(t0.refreshToken, firstRotationAt),
                retiredEntry(t1.refreshToken, clock.now()),
            ]);
        });

        it('grace: the previous token within 30s gets the current token back and leaves the session untouched (D-35)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            const afterRotation = await readSession(t0.sessionId);
            clock.advanceSeconds(10);

            const reissued = await service.rotate(t0.refreshToken);

            expect(reissued).toEqual(t1);
            expect(await readSession(t0.sessionId)).toEqual(afterRotation);
        });

        it('grace: repeated in-grace retries always get the same token and never write (D-35)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            const afterRotation = await readSession(t0.sessionId);

            for (let retry = 0; retry < IN_GRACE_RETRIES; retry++) {
                clock.advanceSeconds(5);
                await expect(service.rotate(t0.refreshToken)).resolves.toEqual(
                    t1,
                );
            }

            expect(await readSession(t0.sessionId)).toEqual(afterRotation);
        });

        it('grace: the evaluation uses the request arrival time, not the processing time (WR-04)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(29);
            const requestedAt = clock.now();
            clock.advanceSeconds(2);

            await expect(
                service.rotate(t0.refreshToken, requestedAt),
            ).resolves.toEqual(t1);
        });

        it('reverse order: a stale request with the previous token, processed after the retry, gets the token the client holds and that token still rotates (WR-05)', async () => {
            const t0 = await service.create(USER_ID);
            const staleRequestAt = clock.now();
            clock.advanceSeconds(10);
            const retried = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(5);

            const stale = await service.rotate(t0.refreshToken, staleRequestAt);
            clock.advanceSeconds(900);
            const next = await service.rotate(retried.refreshToken);

            expect(stale.refreshToken).toBe(retried.refreshToken);
            expect(next.sessionId).toBe(t0.sessionId);
            const stored = await readSession(t0.sessionId);
            expect(stored?.revokedAt).toBeNull();
            expect(stored?.refreshTokenHash).toBe(sha256Hex(next.refreshToken));
        });

        it('grace: a stalled duplicate processed after the client rotated again gets the current token, writes nothing and leaves the session usable (REVIEW-3 WR-01)', async () => {
            const t0 = await service.create(USER_ID);
            const stalledRequestAt = clock.now();
            await service.findRotatable(t0.refreshToken, stalledRequestAt);
            clock.advanceSeconds(10);
            const retried = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(5);
            const t2 = await service.rotate(retried.refreshToken);
            const afterClientRotation = await readSession(t0.sessionId);
            clock.advanceSeconds(5);

            const stalled = await service.rotate(
                t0.refreshToken,
                stalledRequestAt,
            );

            expect(stalled).toEqual(t2);
            expect(await readSession(t0.sessionId)).toEqual(
                afterClientRotation,
            );
            clock.advanceSeconds(60);
            await expect(service.rotate(t2.refreshToken)).resolves.toEqual(
                expect.objectContaining({ sessionId: t0.sessionId }),
            );
        });

        it('grace: a token retired within 30s, older than the previous one, gets the current token back (REVIEW-3 WR-01)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(5);
            const t2 = await service.rotate(t1.refreshToken);
            clock.advanceSeconds(24);

            await expect(service.rotate(t0.refreshToken)).resolves.toEqual(t2);
            await expect(
                service.findRotatable(t0.refreshToken),
            ).resolves.toEqual({ sessionId: t0.sessionId, userId: USER_ID });
        });

        it('reuse: a token retired 31s before the request revokes the whole session, even when a later token is still inside the window (REVIEW-3 WR-01)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(5);
            const t2 = await service.rotate(t1.refreshToken);
            clock.advanceSeconds(26);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );

            const stored = await readSession(t0.sessionId);
            expect(stored?.revokedAt?.getTime()).toBe(clock.now().getTime());
            await expect(service.rotate(t2.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );
        });

        it('grace: after an in-grace re-issue the current token rotates normally and nothing is orphaned (D-35)', async () => {
            const t0 = await service.create(USER_ID);
            const firstRotationAt = clock.now();
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(10);
            await service.rotate(t0.refreshToken);
            clock.advanceSeconds(60);

            const t2 = await service.rotate(t1.refreshToken);

            const stored = await readSession(t0.sessionId);
            expect(stored?.revokedAt).toBeNull();
            expect(stored?.rotationCount).toBe(2);
            expect(stored?.refreshTokenHash).toBe(sha256Hex(t2.refreshToken));
            expect(stored?.retiredRefreshTokens).toEqual([
                retiredEntry(t0.refreshToken, firstRotationAt),
                retiredEntry(t1.refreshToken, clock.now()),
            ]);
        });

        it('grace: a re-issue whose current token cannot be rebuilt after a secret change answers SESSION_EXPIRED without revoking (D-35)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            const afterRotation = await readSession(t0.sessionId);
            const serviceWithRotatedSecret =
                await buildService(ROTATED_JWT_SECRET);
            clock.advanceSeconds(10);

            await expect(
                serviceWithRotatedSecret.rotate(t0.refreshToken),
            ).rejects.toMatchObject(sessionExpired);

            expect(await readSession(t0.sessionId)).toEqual(afterRotation);
            await expect(
                serviceWithRotatedSecret.rotate(t1.refreshToken),
            ).resolves.toMatchObject({ sessionId: t0.sessionId });
        });

        it.each([
            ['without a token seed', { tokenSeed: undefined }],
            ['whose current token was not derived', {}],
        ] as const)(
            'grace: a legacy session %s cannot re-issue and answers SESSION_EXPIRED without revoking (D-35)',
            async (_legacy, overrides) => {
                const legacy = await persistSession(SessionModel, {
                    refreshTokenHash: sha256Hex('legacy-current-token'),
                    retiredRefreshTokens: [
                        retiredEntry('legacy-previous-token', clock.now()),
                    ],
                    ...overrides,
                });
                const before = await readSession(legacy._id.toString());
                clock.advanceSeconds(10);

                await expect(
                    service.rotate('legacy-previous-token'),
                ).rejects.toMatchObject(sessionExpired);

                expect(await readSession(legacy._id.toString())).toEqual(
                    before,
                );
            },
        );

        it('legacy: rotating the current token of a session without a seed initializes the seed and enables re-issue (D-35)', async () => {
            const legacy = await persistSession(SessionModel, {
                refreshTokenHash: sha256Hex('legacy-current-token'),
                tokenSeed: undefined,
            });
            const sessionId = legacy._id.toString();

            const rotated = await service.rotate('legacy-current-token');
            clock.advanceSeconds(10);
            const reissued = await service.rotate('legacy-current-token');

            const stored = await readSession(sessionId);
            expect(stored?.tokenSeed).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(stored?.rotationCount).toBe(1);
            expect(rotated.refreshToken).toBe(
                deriveRefreshToken(
                    REFRESH_TOKEN_KEY,
                    sessionId,
                    1,
                    stored?.tokenSeed ?? '',
                ),
            );
            expect(reissued).toEqual(rotated);
        });

        it('legacy: a raw document without rotationCount and tokenSeed rotates its current token and initializes both fields (REVIEW-3 IN-02)', async () => {
            const sessionId = new Types.ObjectId();
            await SessionModel.collection.insertOne({
                _id: sessionId,
                userId: new Types.ObjectId(USER_ID),
                refreshTokenHash: sha256Hex('raw-legacy-current-token'),
                revokedAt: null,
                expiresAt: new Date(clock.now().getTime() + 60_000),
            });

            const rotated = await service.rotate('raw-legacy-current-token');

            const stored = await readSession(sessionId.toString());
            expect(stored?.rotationCount).toBe(1);
            expect(stored?.tokenSeed).toMatch(OPAQUE_TOKEN_PATTERN);
            expect(rotated.refreshToken).toBe(
                deriveRefreshToken(
                    REFRESH_TOKEN_KEY,
                    sessionId.toString(),
                    1,
                    stored?.tokenSeed ?? '',
                ),
            );
            expect(stored?.retiredRefreshTokens).toEqual([
                retiredEntry('raw-legacy-current-token', clock.now()),
            ]);
        });

        it('reuse: a token retired more than one rotation ago revokes the whole session', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(60);
            const t2 = await service.rotate(t1.refreshToken);
            clock.advanceSeconds(60);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );

            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.revokedAt?.getTime()).toBe(clock.now().getTime());
            await expect(service.rotate(t2.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );
        });

        it('retires only hashes, keeping the last 10 retired tokens', async () => {
            const t0 = await service.create(USER_ID);
            const createdAt = clock.now().getTime();
            const issued = [t0.refreshToken];
            for (let rotation = 0; rotation < 12; rotation++) {
                clock.advanceSeconds(60);
                const next = await service.rotate(issued[issued.length - 1]);
                issued.push(next.refreshToken);
            }
            const retiredAtOf = (index: number) =>
                new Date(createdAt + (index + 1) * 60_000);

            const stored = await readSession(t0.sessionId);

            expect(stored?.retiredRefreshTokens).toEqual(
                issued
                    .slice(2, 12)
                    .map((token, offset) =>
                        retiredEntry(token, retiredAtOf(offset + 2)),
                    ),
            );
            issued.forEach((token) =>
                expect(JSON.stringify(stored)).not.toContain(token),
            );
        });

        async function rotateRepeatedly(rotations: number): Promise<string[]> {
            const t0 = await service.create(USER_ID);
            const issued = [t0.refreshToken];
            for (let rotation = 0; rotation < rotations; rotation++) {
                clock.advanceSeconds(60);
                const next = await service.rotate(issued[issued.length - 1]);
                issued.push(next.refreshToken);
            }
            return issued;
        }

        it('reuse cap: a token retired more than 10 rotations ago answers SESSION_EXPIRED and the session survives (IN-11)', async () => {
            const issued = await rotateRepeatedly(
                RETIRED_REFRESH_TOKENS_LIMIT + 1,
            );
            const current = issued[issued.length - 1];

            await expect(service.rotate(issued[0])).rejects.toMatchObject(
                sessionExpired,
            );

            const stored = await SessionModel.findOne({
                refreshTokenHash: sha256Hex(current),
            }).exec();
            expect(stored?.revokedAt).toBeNull();
            await expect(service.rotate(current)).resolves.toMatchObject({
                sessionId: stored?._id.toString(),
            });
        });

        it('reuse cap: the 10th most recent retired token still revokes the whole session (IN-11)', async () => {
            const issued = await rotateRepeatedly(
                RETIRED_REFRESH_TOKENS_LIMIT + 1,
            );
            const current = issued[issued.length - 1];
            const tenthMostRecentRetired =
                issued[issued.length - 1 - RETIRED_REFRESH_TOKENS_LIMIT];

            await expect(
                service.rotate(tenthMostRecentRetired),
            ).rejects.toMatchObject(sessionRevoked);

            const stored = await SessionModel.findOne({
                refreshTokenHash: sha256Hex(current),
            }).exec();
            expect(stored?.revokedAt?.getTime()).toBe(clock.now().getTime());
            await expect(service.rotate(current)).rejects.toMatchObject(
                sessionRevoked,
            );
        });

        it('a retired token of an already revoked session answers SESSION_REVOKED without touching the revocation (IN-11)', async () => {
            const t0 = await service.create(USER_ID);
            await service.rotate(t0.refreshToken);
            clock.advanceSeconds(60);
            await service.revoke(t0.sessionId);
            const revokedAt = clock.now().getTime();
            clock.advanceSeconds(60);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );

            const stored = await SessionModel.findById(t0.sessionId).exec();
            expect(stored?.revokedAt?.getTime()).toBe(revokedAt);
        });

        it('a token retired within 30s on an already revoked session answers SESSION_REVOKED and re-issues nothing (REVIEW-3 IN-01)', async () => {
            const t0 = await service.create(USER_ID);
            await service.rotate(t0.refreshToken);
            await service.revoke(t0.sessionId);
            const afterRevocation = await readSession(t0.sessionId);
            clock.advanceSeconds(10);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionRevoked,
            );

            expect(await readSession(t0.sessionId)).toEqual(afterRevocation);
        });

        it('a retired token of an expired session answers SESSION_EXPIRED and does not revoke it (IN-11)', async () => {
            const t0 = await service.create(USER_ID);
            const t1 = await service.rotate(t0.refreshToken);
            clock.advanceSeconds(REFRESH_TOKEN_TTL_MS / 1000 + 1);

            await expect(service.rotate(t0.refreshToken)).rejects.toMatchObject(
                sessionExpired,
            );

            const stored = await SessionModel.findById(t0.sessionId).exec();
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

        it('concurrent: two rotations of the same token both get the same new token and rotate the session once (D-35)', async () => {
            const t0 = await service.create(USER_ID);

            const [first, second] = await Promise.all([
                service.rotate(t0.refreshToken),
                service.rotate(t0.refreshToken),
            ]);

            expect(first).toEqual(second);
            expect(await SessionModel.countDocuments()).toBe(1);
            const stored = await readSession(t0.sessionId);
            expect(stored?.refreshTokenHash).toBe(
                sha256Hex(first.refreshToken),
            );
            expect(stored?.rotationCount).toBe(1);
            expect(stored?.retiredRefreshTokens).toEqual([
                retiredEntry(t0.refreshToken, clock.now()),
            ]);
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

        it('declares an index on the retired token hashes for grace and reuse detection', () => {
            expect(SessionModel.schema.indexes()).toContainEqual([
                { 'retiredRefreshTokens.hash': 1 },
                expect.anything(),
            ]);
        });

        it('stores retired tokens without a subdocument _id', async () => {
            const t0 = await service.create(USER_ID);
            await service.rotate(t0.refreshToken);

            const stored = await readSession(t0.sessionId);

            expect(stored?.retiredRefreshTokens[0]).not.toHaveProperty('_id');
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
