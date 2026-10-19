import { Logger } from '@nestjs/common';
import type { EventSubConfig } from 'src/config/eventsub-config';
import { EventSubStartupReporter } from 'src/eventsub/eventsub-startup.reporter';
import { TEST_EVENTSUB_SECRET } from '../../test/eventsub/eventsub-fixtures';
import {
    buildLocalEventSubConfig,
    buildTestEventSubConfig,
    TEST_CALLBACK_URL,
    TEST_HELIX_CLIENT_SECRET,
    TEST_LOCAL_CALLBACK_URL,
} from '../../test/eventsub/test-eventsub-config';

describe('EventSubStartupReporter', () => {
    let warn: jest.SpyInstance;
    let log: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function report(config: EventSubConfig): void {
        new EventSubStartupReporter(config).onApplicationBootstrap();
    }

    function loggedMessages(): string {
        return [...warn.mock.calls, ...log.mock.calls]
            .map(([message]) => String(message))
            .join('\n');
    }

    function expectNoSecret(): void {
        expect(loggedMessages()).not.toContain(TEST_EVENTSUB_SECRET);
        expect(loggedMessages()).not.toContain(TEST_HELIX_CLIENT_SECRET);
    }

    it('warns that EventSub is disabled and the webhook answers 403', () => {
        report({ mode: 'disabled' });

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('TWITCH_EVENTSUB_SECRET');
        expect(message).toContain('TWITCH_EVENTSUB_CALLBACK_URL');
        expect(message).toContain('TWITCH_BROADCASTER_ID');
        expect(message).toContain('403');
        expect(log).not.toHaveBeenCalled();
    });

    it('warns that local mode does not manage Helix subscriptions', () => {
        report(buildLocalEventSubConfig());

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('local mode');
        expect(message).toContain(TEST_LOCAL_CALLBACK_URL);
        expect(message).toContain('Twitch CLI');
        expect(log).not.toHaveBeenCalled();
        expectNoSecret();
    });

    it('logs the broadcaster and the callback in managed mode', () => {
        report(buildTestEventSubConfig());

        expect(log).toHaveBeenCalledTimes(1);
        const message = String(log.mock.calls[0][0]);
        expect(message).toContain('11111');
        expect(message).toContain(TEST_CALLBACK_URL);
        expect(warn).not.toHaveBeenCalled();
        expectNoSecret();
    });
});
