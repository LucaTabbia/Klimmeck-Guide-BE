import { JwtService } from '@nestjs/jwt';
import {
    ACCESS_TOKEN_AUDIENCE,
    OAUTH_STATE_AUDIENCE,
    TOKEN_ISSUER,
} from 'src/auth/token/token-audiences';
import { OAuthStateService } from 'src/auth/twitch/oauth-state.service';
import {
    buildTestAuthConfig,
    TEST_JWT_SECRET,
} from '../../../test/auth/test-auth-config';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const TERMS_VERSION = '2026-11-24';
const OTHER_SECRET = 'another-secret-0123456789abcdef-0123456789';
const OAUTH_STATE_TTL_SECONDS = 600;

interface DecodedState {
    challenge: string;
    termsVersion: string;
    nonce: string;
    aud: string;
    iss: string;
    exp: number;
    iat: number;
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function decodeHeader(token: string): { alg: string } {
    const [header] = token.split('.');
    return JSON.parse(Buffer.from(header, 'base64url').toString()) as {
        alg: string;
    };
}

describe('OAuthStateService', () => {
    const jwtService = new JwtService();
    let service: OAuthStateService;

    beforeEach(() => {
        service = new OAuthStateService(
            new JwtService(),
            buildTestAuthConfig(),
        );
    });

    function signState(
        payload: object,
        overrides: { secret?: string; audience?: string } = {},
    ): string {
        return jwtService.sign(payload, {
            secret: overrides.secret ?? TEST_JWT_SECRET,
            algorithm: 'HS256',
            audience: overrides.audience ?? OAUTH_STATE_AUDIENCE,
            issuer: TOKEN_ISSUER,
            expiresIn: OAUTH_STATE_TTL_SECONDS,
        });
    }

    describe('sign', () => {
        it('signs an HS256 JWT bound to the twitch-oauth-state audience with a 600 s lifetime', async () => {
            const state = await service.sign(CHALLENGE, TERMS_VERSION);

            const decoded = jwtService.decode<DecodedState>(state);
            expect(decodeHeader(state).alg).toBe('HS256');
            expect(decoded.aud).toBe(OAUTH_STATE_AUDIENCE);
            expect(decoded.iss).toBe(TOKEN_ISSUER);
            expect(decoded.exp - decoded.iat).toBe(OAUTH_STATE_TTL_SECONDS);
            expect(decoded.challenge).toBe(CHALLENGE);
            expect(decoded.termsVersion).toBe(TERMS_VERSION);
            expect(typeof decoded.nonce).toBe('string');
            expect(decoded.nonce.length).toBeGreaterThan(0);
        });

        it('produces a different state on every call for the same challenge', async () => {
            const first = await service.sign(CHALLENGE, TERMS_VERSION);
            const second = await service.sign(CHALLENGE, TERMS_VERSION);

            expect(first).not.toBe(second);
        });
    });

    describe('verify', () => {
        it('signs the accepted version next to the challenge (D-19)', async () => {
            const state = await service.sign(CHALLENGE, TERMS_VERSION);

            await expect(service.verify(state)).resolves.toEqual({
                challenge: CHALLENGE,
                termsVersion: TERMS_VERSION,
            });
        });

        it('reads a state without version as no consent (D-19)', async () => {
            const state = signState({ challenge: CHALLENGE, nonce: 'n' });

            await expect(service.verify(state)).resolves.toEqual({
                challenge: CHALLENGE,
                termsVersion: null,
            });
        });

        it('reads a malformed version as no consent (D-19)', async () => {
            const state = signState({
                challenge: CHALLENGE,
                termsVersion: '../x',
                nonce: 'n',
            });

            await expect(service.verify(state)).resolves.toEqual({
                challenge: CHALLENGE,
                termsVersion: null,
            });
        });

        it('returns null for a state signed with another secret', async () => {
            const state = signState(
                { challenge: CHALLENGE, nonce: 'n' },
                { secret: OTHER_SECRET },
            );

            await expect(service.verify(state)).resolves.toBeNull();
        });

        it('returns null for a tampered payload', async () => {
            const state = await service.sign(CHALLENGE, TERMS_VERSION);
            const [header, , signature] = state.split('.');
            const forgedPayload = Buffer.from(
                JSON.stringify({
                    ...jwtService.decode<DecodedState>(state),
                    challenge: 'attacker-challenge',
                }),
            ).toString('base64url');

            await expect(
                service.verify(`${header}.${forgedPayload}.${signature}`),
            ).resolves.toBeNull();
        });

        it('returns null when an access token is used as state (audience klimmeck-api)', async () => {
            const accessToken = signState(
                { challenge: CHALLENGE, sub: 'u1' },
                { audience: ACCESS_TOKEN_AUDIENCE },
            );

            await expect(service.verify(accessToken)).resolves.toBeNull();
        });

        it('returns null for an expired state', async () => {
            const expired = jwtService.sign(
                {
                    challenge: CHALLENGE,
                    nonce: 'n',
                    iat: nowSeconds() - 700,
                    exp: nowSeconds() - 100,
                },
                {
                    secret: TEST_JWT_SECRET,
                    algorithm: 'HS256',
                    audience: OAUTH_STATE_AUDIENCE,
                    issuer: TOKEN_ISSUER,
                },
            );

            await expect(service.verify(expired)).resolves.toBeNull();
        });

        it('returns null for a state without a challenge', async () => {
            const state = signState({ nonce: 'n' });

            await expect(service.verify(state)).resolves.toBeNull();
        });

        it.each([
            ['an empty string', ''],
            ['undefined', undefined],
            ['a number', 42],
            ['garbage', 'not-a-jwt'],
        ])('returns null for %s without throwing', async (_label, state) => {
            await expect(service.verify(state)).resolves.toBeNull();
        });
    });
});
