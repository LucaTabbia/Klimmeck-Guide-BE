import { Logger } from '@nestjs/common';
import { AuthStartupReporter } from 'src/auth/auth-startup.reporter';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    buildTestAuthConfig,
    TEST_DEV_ACCESS_TOKEN,
    TEST_DEV_TWITCH_ID,
} from '../../test/auth/test-auth-config';

const TEST_CLIENT_SECRET = 'test-client-secret';

describe('AuthStartupReporter', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
        warn.mockRestore();
    });

    function warnings(): string[] {
        return warn.mock.calls.map(([message]) => String(message));
    }

    it('warns loudly when the dev auth bypass is enabled, without leaking the token', () => {
        new AuthStartupReporter(
            buildTestAuthConfig({
                devAuth: {
                    accessToken: TEST_DEV_ACCESS_TOKEN,
                    twitchId: TEST_DEV_TWITCH_ID,
                    role: RoleType.innkeeper,
                },
            }),
        ).onApplicationBootstrap();

        const bypassWarnings = warnings().filter((message) =>
            message.includes('DEV AUTH BYPASS ENABLED'),
        );
        expect(bypassWarnings).toHaveLength(1);
        expect(bypassWarnings[0]).toContain(TEST_DEV_TWITCH_ID);
        expect(bypassWarnings[0]).toContain(RoleType.innkeeper);
        expect(warnings().join('\n')).not.toContain(TEST_DEV_ACCESS_TOKEN);
    });

    it('does not warn about the bypass when dev auth is disabled', () => {
        new AuthStartupReporter(
            buildTestAuthConfig({ devAuth: null }),
        ).onApplicationBootstrap();

        expect(
            warnings().some((message) =>
                message.includes('DEV AUTH BYPASS ENABLED'),
            ),
        ).toBe(false);
    });

    it('warns that Twitch login degrades to twitch_not_configured when Twitch is missing', () => {
        new AuthStartupReporter(
            buildTestAuthConfig({ twitch: null, devAuth: null }),
        ).onApplicationBootstrap();

        expect(warnings()).toHaveLength(1);
        expect(warnings()[0]).toContain('Twitch OAuth not configured');
        expect(warnings()[0]).toContain('twitch_not_configured');
    });

    it('does not warn about Twitch when it is configured, nor leak the client secret', () => {
        new AuthStartupReporter(buildTestAuthConfig()).onApplicationBootstrap();

        expect(
            warnings().some((message) =>
                message.includes('Twitch OAuth not configured'),
            ),
        ).toBe(false);
        expect(warnings().join('\n')).not.toContain(TEST_CLIENT_SECRET);
    });
});
