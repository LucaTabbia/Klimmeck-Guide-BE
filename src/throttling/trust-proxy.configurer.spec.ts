import type { HttpAdapterHost } from '@nestjs/core';
import type { ThrottleConfig } from 'src/config/throttle-config';
import { TrustProxyConfigurer } from 'src/throttling/trust-proxy.configurer';

function configurerWith(trustProxy: string | null) {
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
        configurer: new TrustProxyConfigurer(adapterHost, config),
        instance,
    };
}

describe('TrustProxyConfigurer', () => {
    it('leaves trust proxy off when THROTTLE_TRUST_PROXY is empty (C19)', () => {
        const { configurer, instance } = configurerWith(null);

        configurer.onApplicationBootstrap();

        expect(instance.set).not.toHaveBeenCalled();
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
