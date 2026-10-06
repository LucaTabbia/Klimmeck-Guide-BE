import {
    buildAppErrorRedirect,
    buildAppTicketRedirect,
} from 'src/auth/twitch/app-redirect-url';
import {
    buildTwitchAuthorizeUrl,
    TWITCH_AUTHORIZE_URL,
} from 'src/auth/twitch/twitch-authorize-url';
import { TwitchLoginErrorCode } from 'src/auth/twitch/twitch-login-error-code.enum';
import { parseAuthConfig } from 'src/config/auth-config';
import type { TwitchOAuthConfig } from 'src/config/auth-config';
import { TEST_TWITCH_CLIENT_ID } from '../../../test/auth/test-auth-config';

const TWITCH: TwitchOAuthConfig = {
    clientId: TEST_TWITCH_CLIENT_ID,
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/auth/twitch/callback',
};

describe('buildTwitchAuthorizeUrl', () => {
    const authorizeUrl = buildTwitchAuthorizeUrl(TWITCH, 'st');
    const parsed = new URL(authorizeUrl);

    it('targets the Twitch authorize endpoint', () => {
        expect(TWITCH_AUTHORIZE_URL).toBe(
            'https://id.twitch.tv/oauth2/authorize',
        );
        expect(`${parsed.origin}${parsed.pathname}`).toBe(
            'https://id.twitch.tv/oauth2/authorize',
        );
    });

    it('requests an authorization code for the configured client with forced verification', () => {
        expect(parsed.searchParams.get('response_type')).toBe('code');
        expect(parsed.searchParams.get('client_id')).toBe(
            TEST_TWITCH_CLIENT_ID,
        );
        expect(parsed.searchParams.get('redirect_uri')).toBe(
            TWITCH.redirectUri,
        );
        expect(parsed.searchParams.get('force_verify')).toBe('true');
        expect(parsed.searchParams.get('state')).toBe('st');
    });

    it('sends an empty but present scope (identity only)', () => {
        expect(parsed.searchParams.has('scope')).toBe(true);
        expect(parsed.searchParams.get('scope')).toBe('');
        expect(
            authorizeUrl.includes('scope=&') || authorizeUrl.endsWith('scope='),
        ).toBe(true);
    });

    it('never leaks the client secret', () => {
        expect(authorizeUrl).not.toContain(TWITCH.clientSecret);
    });
});

describe('app redirect urls', () => {
    it('appends the ticket to the app deep link', () => {
        expect(buildAppTicketRedirect('klimmeck://auth', 'abc_-1')).toBe(
            'klimmeck://auth?ticket=abc_-1',
        );
    });

    it('appends the error code to the app deep link', () => {
        expect(
            buildAppErrorRedirect(
                'klimmeck://auth',
                TwitchLoginErrorCode.TWITCH_NOT_CONFIGURED,
            ),
        ).toBe('klimmeck://auth?error=twitch_not_configured');
    });

    it.each([
        'klimmeck://auth',
        'com.klimmeck.app://auth/callback',
        'klimmeck_app://auth',
        ' klimmeck://auth',
        'javascript://%0aalert(1)',
    ])('never throws for %p once it passed the boot validation', (value) => {
        const accepted = tryParseAppAuthRedirectUrl(value);
        if (accepted === null) return;

        expect(() => buildAppTicketRedirect(accepted, 'abc')).not.toThrow();
        expect(() =>
            buildAppErrorRedirect(accepted, TwitchLoginErrorCode.ACCESS_DENIED),
        ).not.toThrow();
    });
});

function tryParseAppAuthRedirectUrl(value: string): string | null {
    try {
        return parseAuthConfig({
            JWT_SECRET: 's'.repeat(32),
            APP_AUTH_REDIRECT_URL: value,
        }).appAuthRedirectUrl;
    } catch {
        return null;
    }
}

describe('TwitchLoginErrorCode', () => {
    it('exposes the redirect error codes consumed by the app', () => {
        expect(Object.values(TwitchLoginErrorCode).sort()).toEqual(
            [
                'access_denied',
                'invalid_request',
                'invalid_state',
                'twitch_client_mismatch',
                'twitch_exchange_failed',
                'twitch_not_configured',
            ].sort(),
        );
    });
});
