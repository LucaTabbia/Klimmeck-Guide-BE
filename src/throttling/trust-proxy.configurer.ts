import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Application } from 'express';
import { RUNTIME_CONFIG } from 'src/config/runtime-config';
import type { RuntimeConfig } from 'src/config/runtime-config';
import { THROTTLE_CONFIG } from 'src/config/throttle-config';
import type { ThrottleConfig } from 'src/config/throttle-config';

const HOP_COUNT_PATTERN = /^\d+$/;
const TRUST_PROXY_OFF_WARNING =
    'Trust proxy spento in produzione: dietro un reverse proxy il throttling vede un solo indirizzo';

// spento di default (C19): finché la topologia non è nota X-Forwarded-For non decide il bucket
@Injectable()
export class TrustProxyConfigurer implements OnApplicationBootstrap {
    private readonly logger = new Logger(TrustProxyConfigurer.name);

    constructor(
        private readonly adapterHost: HttpAdapterHost,
        @Inject(THROTTLE_CONFIG) private readonly config: ThrottleConfig,
        @Inject(RUNTIME_CONFIG) private readonly runtime: RuntimeConfig,
    ) {}

    onApplicationBootstrap(): void {
        const trustProxy = this.config.trustProxy;
        if (trustProxy === null) {
            if (this.runtime.production)
                this.logger.warn(TRUST_PROXY_OFF_WARNING);
            return;
        }
        this.adapterHost.httpAdapter
            .getInstance<Application>()
            .set('trust proxy', toTrustProxySetting(trustProxy));
        this.logger.log('Trust proxy attivo per il throttling');
    }
}

function toTrustProxySetting(trustProxy: string): number | string {
    return HOP_COUNT_PATTERN.test(trustProxy) ? Number(trustProxy) : trustProxy;
}
