import type { FactoryProvider } from '@nestjs/common';
import { Clock } from 'src/auth/clock';
import { PUSH_CONFIG, PushConfig } from 'src/config/push-config';
import { FcmPushTransport } from 'src/push/transport/fcm-push-transport';
import { NoopPushTransport } from 'src/push/transport/noop-push-transport';
import { PushTransport } from 'src/push/transport/push-transport';

export const pushTransportProvider: FactoryProvider<PushTransport> = {
    provide: PushTransport,
    inject: [PUSH_CONFIG, Clock],
    useFactory: (config: PushConfig, clock: Clock): PushTransport =>
        config.serviceAccount
            ? FcmPushTransport.connect(config.serviceAccount, clock)
            : new NoopPushTransport(),
};
