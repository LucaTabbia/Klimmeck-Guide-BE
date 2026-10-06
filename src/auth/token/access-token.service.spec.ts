import { JwtService } from '@nestjs/jwt';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { AccessTokenService } from 'src/auth/token/access-token.service';
import {
    ACCESS_TOKEN_AUDIENCE,
    OAUTH_STATE_AUDIENCE,
    TOKEN_ISSUER,
} from 'src/auth/token/token-audiences';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    buildTestAuthConfig,
    TEST_JWT_SECRET,
} from '../../../test/auth/test-auth-config';

const SUBJECT = {
    userId: '64b000000000000000000001',
    twitchId: 'twitch-123',
    role: RoleType.adventurer,
    sessionId: '64b0000000000000000000aa',
};

const VALID_CLAIMS = {
    sub: SUBJECT.userId,
    twitchId: SUBJECT.twitchId,
    role: SUBJECT.role,
    sid: SUBJECT.sessionId,
};

const OTHER_SECRET = 'another-secret-0123456789abcdef-0123456789';

interface DecodedAccessToken {
    sub: string;
    twitchId: string;
    role: string;
    sid: string;
    aud: string;
    iss: string;
    exp: number;
    iat: number;
}

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

describe('AccessTokenService', () => {
    const jwtService = new JwtService();
    let service: AccessTokenService;

    beforeEach(() => {
        service = new AccessTokenService(
            new JwtService(),
            buildTestAuthConfig(),
        );
    });

    function signRaw(
        payload: object,
        options: { secret?: string; audience?: string; issuer?: string } = {},
    ): string {
        return jwtService.sign(payload, {
            secret: options.secret ?? TEST_JWT_SECRET,
            audience: options.audience ?? ACCESS_TOKEN_AUDIENCE,
            issuer: options.issuer ?? TOKEN_ISSUER,
            algorithm: 'HS256',
        });
    }

    async function expectUnauthenticated(token: string): Promise<void> {
        await expect(service.verify(token)).rejects.toMatchObject({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    }

    describe('sign', () => {
        it('signs an HS256 access token with session claims, audience, issuer and a 900 s TTL', async () => {
            const { accessToken, expiresAt } = await service.sign(SUBJECT);

            const header = JSON.parse(
                Buffer.from(accessToken.split('.')[0], 'base64url').toString(),
            ) as { alg: string };
            const claims = jwtService.decode<DecodedAccessToken>(accessToken);

            expect(header.alg).toBe('HS256');
            expect(claims).toMatchObject({
                sub: SUBJECT.userId,
                twitchId: SUBJECT.twitchId,
                role: SUBJECT.role,
                sid: SUBJECT.sessionId,
                aud: ACCESS_TOKEN_AUDIENCE,
                iss: TOKEN_ISSUER,
            });
            expect(claims.exp - claims.iat).toBe(900);
            expect(expiresAt.getTime()).toBe(claims.exp * 1000);
        });
    });

    describe('verify', () => {
        it('resolves a token produced by sign to the session identity', async () => {
            const { accessToken, expiresAt } = await service.sign(SUBJECT);

            await expect(service.verify(accessToken)).resolves.toEqual({
                userId: SUBJECT.userId,
                twitchId: SUBJECT.twitchId,
                role: SUBJECT.role,
                sessionId: SUBJECT.sessionId,
                expiresAt: expiresAt.getTime(),
            });
        });

        it('rejects a token signed with another secret', async () => {
            await expectUnauthenticated(
                signRaw(
                    { ...VALID_CLAIMS, exp: nowSeconds() + 60 },
                    { secret: OTHER_SECRET },
                ),
            );
        });

        it('rejects a tampered payload', async () => {
            const { accessToken } = await service.sign(SUBJECT);
            const [header, , signature] = accessToken.split('.');
            const tampered = base64url({
                ...VALID_CLAIMS,
                role: RoleType.innkeeper,
                aud: ACCESS_TOKEN_AUDIENCE,
                iss: TOKEN_ISSUER,
                exp: nowSeconds() + 60,
            });

            await expectUnauthenticated(`${header}.${tampered}.${signature}`);
        });

        it('rejects an OAuth state token signed with the same secret (token confusion)', async () => {
            await expectUnauthenticated(
                signRaw(
                    { ...VALID_CLAIMS, exp: nowSeconds() + 60 },
                    { audience: OAUTH_STATE_AUDIENCE },
                ),
            );
        });

        it('rejects a token from another issuer', async () => {
            await expectUnauthenticated(
                signRaw(
                    { ...VALID_CLAIMS, exp: nowSeconds() + 60 },
                    { issuer: 'someone-else' },
                ),
            );
        });

        it('rejects an expired token', async () => {
            await expectUnauthenticated(
                signRaw({ ...VALID_CLAIMS, exp: nowSeconds() - 60 }),
            );
        });

        it("rejects an unsigned token with alg: 'none'", async () => {
            const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(
                {
                    ...VALID_CLAIMS,
                    aud: ACCESS_TOKEN_AUDIENCE,
                    iss: TOKEN_ISSUER,
                    exp: nowSeconds() + 60,
                },
            )}.`;

            await expectUnauthenticated(unsigned);
        });

        it('rejects claims without a session id', async () => {
            const { sid: _sid, ...withoutSid } = VALID_CLAIMS;

            await expectUnauthenticated(
                signRaw({ ...withoutSid, exp: nowSeconds() + 60 }),
            );
        });

        it('rejects an unknown role', async () => {
            await expectUnauthenticated(
                signRaw({
                    ...VALID_CLAIMS,
                    role: 'emperor',
                    exp: nowSeconds() + 60,
                }),
            );
        });

        it('rejects a string that is not a JWT', async () => {
            await expectUnauthenticated('not-a-jwt');
        });
    });
});
