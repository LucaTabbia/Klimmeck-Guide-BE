import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import type {
    EventSubConfig,
    ManagedEventSubConfig,
} from 'src/config/eventsub-config';
import {
    EventSubSubscriptionType,
    STREAMER_SCOPE_REMEDY,
} from 'src/eventsub/eventsub-types';
import {
    describeHelixError,
    TwitchHelixClient,
    TwitchHelixError,
} from 'src/eventsub/helix/twitch-helix.client';
import type { EventSubSubscription } from 'src/eventsub/helix/twitch-helix.client';
import {
    desiredSubscriptions,
    planReconciliation,
} from './plan-reconciliation';
import type { DesiredSubscription } from './plan-reconciliation';

const CONFLICT_STATUS = 409;
const FORBIDDEN_STATUS = 403;
const REDEMPTION_TYPE: string = EventSubSubscriptionType.redemptionAdd;

@Injectable()
export class EventSubSubscriptionManager
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger('EventSub');
    private inFlight: Promise<void> | null = null;
    private rerunRequested = false;
    private timer: NodeJS.Timeout | null = null;

    constructor(
        @Inject(EVENTSUB_CONFIG) private readonly config: EventSubConfig,
        private readonly helix: TwitchHelixClient,
    ) {}

    // mai atteso: Nest attende i bootstrap hook prima di listen() e Twitch invia il challenge solo a server in ascolto
    onApplicationBootstrap(): void {
        if (this.config.mode !== 'managed') return;
        this.startTimer(this.config.reconcileIntervalMs);
        void this.reconcileSafely();
    }

    onModuleDestroy(): void {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    reconcile(): Promise<void> {
        const config = this.config;
        if (config.mode !== 'managed') return Promise.resolve();
        if (this.inFlight) {
            this.rerunRequested = true;
            return this.inFlight;
        }
        this.inFlight = this.runUntilSettled(config).finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    reconcileSafely(): Promise<void> {
        return this.reconcile().catch((error: unknown) =>
            this.logger.error(
                `EventSub reconcile failed: ${describeHelixError(error)}`,
            ),
        );
    }

    private startTimer(intervalMs: number): void {
        if (intervalMs <= 0) return;
        this.timer = setInterval(
            () => void this.reconcileSafely(),
            intervalMs,
        ).unref();
    }

    // un rerun richiesto durante un run fallito parte comunque (D-14): la revocation non aspetta il timer
    private async runUntilSettled(
        config: ManagedEventSubConfig,
    ): Promise<void> {
        let failure: { error: unknown } | null = null;
        do {
            this.rerunRequested = false;
            failure = await this.runCapturingFailure(config);
        } while (this.rerunRequested);
        if (failure) throw failure.error;
    }

    private async runCapturingFailure(
        config: ManagedEventSubConfig,
    ): Promise<{ error: unknown } | null> {
        try {
            await this.runOnce(config);
            return null;
        } catch (error) {
            return { error };
        }
    }

    private async runOnce(config: ManagedEventSubConfig): Promise<void> {
        const existing = await this.helix.listEventSubSubscriptions();
        const plan = planReconciliation(
            existing,
            desiredSubscriptions(config.broadcasterId),
            config.callbackUrl,
        );
        const removed: EventSubSubscription[] = [];
        const removeFailed: EventSubSubscription[] = [];
        for (const subscription of plan.remove) {
            const outcome = (await this.removeSubscription(subscription))
                ? removed
                : removeFailed;
            outcome.push(subscription);
        }
        const created: EventSubSubscription[] = [];
        for (const wanted of plan.create) {
            const subscription = await this.createSubscription(wanted, config);
            if (subscription) created.push(subscription);
        }
        if (plan.ignored.length > 0) {
            this.logger.debug(
                `EventSub reconcile ignored ${plan.ignored.length} subscriptions it does not own`,
            );
        }
        const failedSuffix =
            removeFailed.length > 0
                ? `, removeFailed [${describeAll(removeFailed)}]`
                : '';
        this.logger.log(
            `EventSub subscriptions reconciled: kept [${describeAll(plan.keep)}], removed [${describeAll(removed)}]${failedSuffix}, created [${describeAll(created)}]`,
        );
    }

    private async removeSubscription(
        subscription: EventSubSubscription,
    ): Promise<boolean> {
        try {
            await this.helix.deleteEventSubSubscription(subscription.id);
            return true;
        } catch (error) {
            this.logger.error(
                `EventSub subscription ${subscription.type} ${subscription.id} could not be deleted: ${describeHelixError(error)}`,
            );
            return false;
        }
    }

    private async createSubscription(
        wanted: DesiredSubscription,
        config: ManagedEventSubConfig,
    ): Promise<EventSubSubscription | null> {
        try {
            return await this.helix.createEventSubSubscription({
                ...wanted,
                transport: {
                    method: 'webhook',
                    callback: config.callbackUrl,
                    secret: config.secret,
                },
            });
        } catch (error) {
            this.logCreateFailure(wanted.type, error);
            return null;
        }
    }

    private logCreateFailure(type: string, error: unknown): void {
        const status =
            error instanceof TwitchHelixError ? error.status : undefined;
        if (status === CONFLICT_STATUS) {
            this.logger.warn(
                `EventSub subscription ${type} already exists (409): the next reconcile will see it`,
            );
            return;
        }
        if (status === FORBIDDEN_STATUS && type === REDEMPTION_TYPE) {
            this.logger.error(
                `EventSub subscription ${type} rejected with status 403: ${STREAMER_SCOPE_REMEDY}`,
            );
            return;
        }
        this.logger.error(
            `EventSub subscription ${type} could not be created: ${describeHelixError(error)}`,
        );
    }
}

function describeAll(subscriptions: EventSubSubscription[]): string {
    return subscriptions
        .map(({ type, id, status }) => `${type} ${id} ${status}`)
        .join(', ');
}
