import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import {
    THROTTLE_CONFIG,
    throttleConfigProvider,
} from 'src/config/throttle-config';
import type { ThrottleConfig } from 'src/config/throttle-config';
import { AppThrottlerGuard } from 'src/throttling/app-throttler.guard';
import {
    DEFAULT_THROTTLER,
    WEBHOOK_THROTTLER,
} from 'src/throttling/throttled.decorator';
import { TrustProxyConfigurer } from 'src/throttling/trust-proxy.configurer';

@Module({
    providers: [throttleConfigProvider],
    exports: [THROTTLE_CONFIG],
})
export class ThrottleConfigModule {}

// throttler in memoria, una sola istanza (D-08): Redis rinviato al backlog
@Global()
@Module({
    imports: [
        ThrottlerModule.forRootAsync({
            imports: [ThrottleConfigModule],
            inject: [THROTTLE_CONFIG],
            useFactory: (config: ThrottleConfig) => ({
                throttlers: [
                    {
                        name: DEFAULT_THROTTLER,
                        ttl: config.ttlMs,
                        limit: config.limit,
                    },
                    {
                        name: WEBHOOK_THROTTLER,
                        ttl: config.ttlMs,
                        limit: config.webhookLimit,
                    },
                ],
            }),
        }),
        ThrottleConfigModule,
    ],
    providers: [AppThrottlerGuard, TrustProxyConfigurer],
    exports: [AppThrottlerGuard, ThrottleConfigModule],
})
export class ThrottlingModule {}
