import { Logger } from '@nestjs/common';
import { PushStartupReporter } from 'src/push/push-startup.reporter';

const SERVICE_ACCOUNT = {
    projectId: 'klimmeck-test',
    clientEmail: 'push@klimmeck-test.iam.gserviceaccount.com',
    privateKey:
        '-----BEGIN PRIVATE KEY-----\nSECRETKEYMATERIAL\n-----END PRIVATE KEY-----\n',
};

describe('PushStartupReporter', () => {
    let warn: jest.SpyInstance;
    let log: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    });

    afterEach(() => {
        warn.mockRestore();
        log.mockRestore();
    });

    function loggedMessages(): string {
        return [...warn.mock.calls, ...log.mock.calls]
            .map(([message]) => String(message))
            .join('\n');
    }

    it('warns that push is disabled when no service account is configured', () => {
        new PushStartupReporter({
            serviceAccount: null,
        }).onApplicationBootstrap();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain(
            'FIREBASE_SERVICE_ACCOUNT',
        );
        expect(String(warn.mock.calls[0][0])).toContain('PUSH_DISABLED');
        expect(log).not.toHaveBeenCalled();
    });

    it('logs only the Firebase project id when push is enabled', () => {
        new PushStartupReporter({
            serviceAccount: SERVICE_ACCOUNT,
        }).onApplicationBootstrap();

        expect(log).toHaveBeenCalledTimes(1);
        expect(String(log.mock.calls[0][0])).toContain('klimmeck-test');
        expect(warn).not.toHaveBeenCalled();
        expect(loggedMessages()).not.toContain('push@klimmeck-test');
        expect(loggedMessages()).not.toContain('SECRETKEYMATERIAL');
        expect(loggedMessages()).not.toContain('PRIVATE KEY');
    });
});
