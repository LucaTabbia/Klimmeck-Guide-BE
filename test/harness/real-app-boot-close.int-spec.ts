import { Logger } from '@nestjs/common';
import { bootRealApp, REAL_BOOT_TIMEOUT_MS } from './real-app-boot';

describe('bootRealApp close', () => {
    afterEach(() => jest.restoreAllMocks());

    it(
        'closes the app without logging an error (C-IN-01)',
        async () => {
            const boot = await bootRealApp({ dbName: 'real-app-boot-close' });
            const error = jest.spyOn(Logger.prototype, 'error');

            await boot.close();

            expect(error.mock.calls).toEqual([]);
        },
        REAL_BOOT_TIMEOUT_MS,
    );
});
