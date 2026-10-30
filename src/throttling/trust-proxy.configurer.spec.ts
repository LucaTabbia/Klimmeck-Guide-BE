import { Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { RuntimeConfig } from 'src/config/runtime-config';
import type { ThrottleConfig } from 'src/config/throttle-config';
import { TrustProxyConfigurer } from 'src/throttling/trust-proxy.configurer';

const TRUST_PROXY_OFF_WARNING =
    'Trust proxy spento in produzione: dietro un reverse proxy il throttling vede un solo indirizzo';

function runtimeOf(production: boolean): RuntimeConfig {
    return {
        mode: production ? 'production' : 'test',
        production,
        modeDefaulted: false,
    };
}

function configurerWith(trustProxy: string | null, production = false) {
    const instance = { set: jest.fn() };
    const adapterHost = {
        httpAdapter: { getInstance: () => instance },
    } as unknown as HttpAdapterHost;
    const config: ThrottleConfig = {
        ttlMs: 60_000,
        limit: 20,
        webhookLimit: 1_000,
        trustProxy,
    };
    return {
        configurer: new TrustProxyConfigurer(
            adapterHost,
            config,
            runtimeOf(production),
        ),
        instance,
    };
}

describe('TrustProxyConfigurer', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('leaves trust proxy off when THROTTLE_TRUST_PROXY is empty (C19)', () => {
        const { configurer, instance } = configurerWith(null);

        configurer.onApplicationBootstrap();

        expect(instance.set).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns once without values when trust proxy is off in production (C19)', () => {
        const { configurer, instance } = configurerWith(null, true);

        configurer.onApplicationBootstrap();

        expect(instance.set).not.toHaveBeenCalled();
        expect(warn.mock.calls).toEqual([[TRUST_PROXY_OFF_WARNING]]);
    });

    it('stays silent in production when trust proxy is set (C19)', () => {
        const { configurer } = configurerWith('1', true);

        configurer.onApplicationBootstrap();

        expect(warn).not.toHaveBeenCalled();
    });

    it('sets a hop count as a number (C19)', () => {
        const { configurer, instance } = configurerWith('1');

        configurer.onApplicationBootstrap();

        expect(instance.set).toHaveBeenCalledWith('trust proxy', 1);
    });

    it('sets an address list as a string (C19)', () => {
        const { configurer, instance } = configurerWith('loopback, 10.0.0.0/8');

        configurer.onApplicationBootstrap();

        expect(instance.set).toHaveBeenCalledWith(
            'trust proxy',
            'loopback, 10.0.0.0/8',
        );
    });
});
