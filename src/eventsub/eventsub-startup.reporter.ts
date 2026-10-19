import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import type { EventSubConfig } from 'src/config/eventsub-config';

const EVENTSUB_DISABLED_WARNING =
    'EventSub disabled: TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID are not configured. The webhook answers 403 and no subscription is managed.';

// mai il secret EventSub né le credenziali dell'app nel log di boot (D-12)
@Injectable()
export class EventSubStartupReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger('EventSub');

    constructor(
        @Inject(EVENTSUB_CONFIG) private readonly config: EventSubConfig,
    ) {}

    onApplicationBootstrap(): void {
        const config = this.config;
        if (config.mode === 'disabled') {
            this.logger.warn(EVENTSUB_DISABLED_WARNING);
            return;
        }
        if (config.mode === 'local') {
            this.logger.warn(
                `EventSub local mode: callback ${config.callbackUrl} is not https. The webhook verifies signatures (use the Twitch CLI) but Helix subscriptions are not managed.`,
            );
            return;
        }
        this.logger.log(
            `EventSub enabled for broadcaster ${config.broadcasterId} with callback ${config.callbackUrl}: subscriptions are reconciled at boot and every hour.`,
        );
    }
}
