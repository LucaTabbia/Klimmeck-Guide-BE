import { Logger } from '@nestjs/common';
import type { RuntimeConfig } from 'src/config/runtime-config';
import { RuntimeModeReporter } from 'src/config/runtime-mode.reporter';

describe('RuntimeModeReporter', () => {
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
        log.mockRestore();
        warn.mockRestore();
    });

    function report(runtime: RuntimeConfig): void {
        new RuntimeModeReporter(runtime).onApplicationBootstrap();
    }

    function messages(spy: jest.SpyInstance): string[] {
        return spy.mock.calls.map(([message]) => String(message));
    }

    it('declares the production mode with introspection disabled at boot (D-05)', () => {
        report({ mode: 'production', production: true, modeDefaulted: false });

        expect(messages(log)).toEqual([
            'Modalità production: introspection e landing page spente',
        ]);
        expect(messages(warn)).toEqual([]);
    });

    it('declares the development mode with introspection enabled', () => {
        report({
            mode: 'development',
            production: false,
            modeDefaulted: false,
        });

        expect(messages(log)).toEqual([
            'Modalità development: introspection e landing page attive',
        ]);
        expect(messages(warn)).toEqual([]);
    });

    it('warns when NODE_ENV is empty (D-05)', () => {
        report({
            mode: 'development',
            production: false,
            modeDefaulted: true,
        });

        expect(messages(warn)).toEqual([
            'NODE_ENV vuoto: avvio in development. In produzione impostare NODE_ENV=production',
        ]);
        expect(messages(log)).toEqual([
            'Modalità development: introspection e landing page attive',
        ]);
    });
});
