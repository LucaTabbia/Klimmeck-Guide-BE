import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Application } from 'express';
import { THROTTLE_CONFIG } from 'src/config/throttle-config';
import type { ThrottleConfig } from 'src/config/throttle-config';

const HOP_COUNT_PATTERN = /^\d+$/;

// spento di default (C19): finché la topologia non è nota X-Forwarded-For non decide il bucket
@Injectable()
export class TrustProxyConfigurer implements OnApplicationBootstrap {
    private readonly logger = new Logger(TrustProxyConfigurer.name);

    constructor(
        private readonly adapterHost: HttpAdapterHost,
        @Inject(THROTTLE_CONFIG) private readonly config: ThrottleConfig,
    ) {}

    onApplicationBootstrap(): void {
        const trustProxy = this.config.trustProxy;
        if (trustProxy === null) return;
        this.adapterHost.httpAdapter
            .getInstance<Application>()
            .set('trust proxy', toTrustProxySetting(trustProxy));
        this.logger.log('Trust proxy attivo per il throttling');
    }
}

function toTrustProxySetting(trustProxy: string): number | string {
    return HOP_COUNT_PATTERN.test(trustProxy) ? Number(trustProxy) : trustProxy;
}
