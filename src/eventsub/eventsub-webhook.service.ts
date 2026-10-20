import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { Clock } from 'src/auth/clock';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import type {
    EventSubConfig,
    EventSubWebhookConfig,
} from 'src/config/eventsub-config';
import { readEventSubHeaders } from 'src/eventsub/eventsub-headers';
import {
    parseChallenge,
    parseNotification,
    parseRevocation,
} from 'src/eventsub/eventsub-payload';
import type {
    NotificationPayload,
    RedemptionEvent,
    StreamOnlineEvent,
} from 'src/eventsub/eventsub-payload';
import { verifyEventSubSignature } from 'src/eventsub/eventsub-signature';
import {
    AUTHORIZATION_REVOKED_STATUS,
    EventSubMessageType,
    EventSubSubscriptionType,
    STREAMER_SCOPE_REMEDY,
} from 'src/eventsub/eventsub-types';
import { LogThrottle } from 'src/eventsub/log-throttle';
import {
    CreditOutcome,
    PointsCreditService,
} from 'src/eventsub/points-credit.service';
import {
    StreamOnlineOutcome,
    StreamOnlineRecorder,
} from 'src/eventsub/stream-online.recorder';
import { EventSubSubscriptionManager } from 'src/eventsub/subscriptions/eventsub-subscription.manager';
import {
    challengeReply,
    FORBIDDEN,
    NO_CONTENT,
    RETRY_LATER,
} from 'src/eventsub/webhook-reply';
import type { WebhookReply } from 'src/eventsub/webhook-reply';
import { describeError } from 'src/mongo/mongo-errors';
import { streamerLive } from 'src/push/push-events';
import { PushService } from 'src/push/push.service';

type SupportedNotification = Extract<
    NotificationPayload,
    { kind: 'redemption' | 'streamOnline' }
>;

const SUBSCRIPTION_TYPE_OF: Record<
    SupportedNotification['kind'],
    EventSubSubscriptionType
> = {
    redemption: EventSubSubscriptionType.redemptionAdd,
    streamOnline: EventSubSubscriptionType.streamOnline,
};

const REDEMPTION_TYPE: string = EventSubSubscriptionType.redemptionAdd;
const REJECTION_LOG_INTERVAL_MS = 60_000;
const MISSING_HEADERS_REJECTION =
    'EventSub request rejected: missing EventSub headers';
const INVALID_SIGNATURE_REJECTION =
    'EventSub request rejected: invalid signature or outside the replay window';

const MESSAGE_TYPES: ReadonlySet<string> = new Set(
    Object.values(EventSubMessageType),
);

function messageTypeOf(value: string): EventSubMessageType | null {
    return MESSAGE_TYPES.has(value) ? (value as EventSubMessageType) : null;
}

@Injectable()
export class EventSubWebhookService {
    private readonly logger = new Logger('EventSub');
    // l'endpoint è pubblico: i rifiuti non autenticati non devono poter gonfiare i log
    private readonly missingHeadersLog = new LogThrottle(
        REJECTION_LOG_INTERVAL_MS,
    );
    private readonly invalidSignatureLog = new LogThrottle(
        REJECTION_LOG_INTERVAL_MS,
    );

    constructor(
        @Inject(EVENTSUB_CONFIG) private readonly config: EventSubConfig,
        private readonly clock: Clock,
        private readonly credit: PointsCreditService,
        private readonly streamOnline: StreamOnlineRecorder,
        private readonly push: PushService,
        private readonly subscriptions: EventSubSubscriptionManager,
    ) {}

    // non lancia mai: un errore grezzo uscito dal controller finirebbe nel log con lo stack (Pitfall 16)
    async handle(
        headers: IncomingHttpHeaders,
        rawBody: Buffer | undefined,
        body: unknown,
    ): Promise<WebhookReply> {
        if (this.config.mode === 'disabled') {
            this.logger.debug(
                'EventSub request rejected: EventSub is disabled',
            );
            return FORBIDDEN;
        }
        try {
            return await this.route(this.config, headers, rawBody, body);
        } catch (error) {
            this.logger.error(
                `EventSub message handling failed (${describeError(error)})`,
            );
            return RETRY_LATER;
        }
    }

    private async route(
        config: EventSubWebhookConfig,
        headers: IncomingHttpHeaders,
        rawBody: Buffer | undefined,
        body: unknown,
    ): Promise<WebhookReply> {
        const now = this.clock.now();
        const signed = readEventSubHeaders(headers);
        if (!signed) {
            return this.reject(
                this.missingHeadersLog,
                MISSING_HEADERS_REJECTION,
                now,
            );
        }
        // la firma precede ogni ramo, challenge incluso (D-02)
        if (!verifyEventSubSignature(signed, rawBody, config.secret, now)) {
            return this.reject(
                this.invalidSignatureLog,
                INVALID_SIGNATURE_REJECTION,
                now,
            );
        }
        const { messageId } = signed;
        switch (messageTypeOf(signed.messageType)) {
            case EventSubMessageType.verification:
                return this.answerChallenge(messageId, body);
            case EventSubMessageType.revocation:
                return this.handleRevocation(messageId, body);
            case EventSubMessageType.notification:
                return this.handleNotification(config, messageId, body, now);
            default:
                this.logger.warn(
                    `EventSub message ${messageId} of unknown type ignored`,
                );
                return NO_CONTENT;
        }
    }

    private reject(
        throttle: LogThrottle,
        message: string,
        now: Date,
    ): WebhookReply {
        const suppressed = throttle.admit(now);
        if (suppressed === null) return FORBIDDEN;
        const suffix =
            suppressed > 0
                ? ` (${suppressed} similar rejections suppressed)`
                : '';
        this.logger.warn(`${message}${suffix}`);
        return FORBIDDEN;
    }

    private answerChallenge(messageId: string, body: unknown): WebhookReply {
        const challenge = parseChallenge(body);
        if (!challenge) return FORBIDDEN;
        this.logger.log(
            `EventSub callback verification answered (message ${messageId})`,
        );
        return challengeReply(challenge);
    }

    private handleRevocation(messageId: string, body: unknown): WebhookReply {
        const notice = parseRevocation(body);
        if (notice) {
            const needsRemedy =
                notice.status === AUTHORIZATION_REVOKED_STATUS &&
                notice.type === REDEMPTION_TYPE;
            const remedy = needsRemedy ? `: ${STREAMER_SCOPE_REMEDY}` : '';
            this.logger.error(
                `EventSub subscription ${notice.type} revoked by Twitch (status ${notice.status}, id ${notice.subscriptionId})${remedy}`,
            );
        } else {
            this.logger.warn(
                `EventSub revocation ${messageId} has an invalid payload`,
            );
        }
        void this.subscriptions.reconcileSafely();
        return NO_CONTENT;
    }

    private async handleNotification(
        config: EventSubWebhookConfig,
        messageId: string,
        body: unknown,
        now: Date,
    ): Promise<WebhookReply> {
        const payload = parseNotification(body);
        if (payload.kind === 'unsupported') {
            this.logger.warn(
                `EventSub ${payload.subscriptionType} notification ${messageId} ignored: unsupported subscription type`,
            );
            return NO_CONTENT;
        }
        if (payload.kind === 'invalid') {
            this.logger.error(
                `EventSub ${payload.subscriptionType} notification ${messageId} has an invalid payload`,
            );
            return NO_CONTENT;
        }
        if (!this.isConfiguredChannel(config, payload, messageId)) {
            return NO_CONTENT;
        }
        if (payload.kind === 'redemption') {
            return this.creditRedemption(payload.event, messageId, now);
        }
        return this.recordStreamOnline(payload.event, messageId, now);
    }

    private isConfiguredChannel(
        config: EventSubWebhookConfig,
        payload: SupportedNotification,
        messageId: string,
    ): boolean {
        const broadcaster = payload.event.broadcasterUserId;
        if (broadcaster === config.broadcasterId) return true;
        this.logger.warn(
            `EventSub ${SUBSCRIPTION_TYPE_OF[payload.kind]} notification ${messageId} ignored: broadcaster ${broadcaster} is not the configured channel`,
        );
        return false;
    }

    private async creditRedemption(
        event: RedemptionEvent,
        messageId: string,
        now: Date,
    ): Promise<WebhookReply> {
        let outcome: CreditOutcome;
        try {
            outcome = await this.credit.credit(event, messageId, now);
        } catch (error) {
            this.logger.error(
                `EventSub redemption ${messageId} not credited (${describeError(error)}): Twitch will redeliver`,
            );
            return RETRY_LATER;
        }
        this.logCreditOutcome(outcome, event, messageId);
        return NO_CONTENT;
    }

    private logCreditOutcome(
        outcome: CreditOutcome,
        event: RedemptionEvent,
        messageId: string,
    ): void {
        if (outcome === CreditOutcome.credited) {
            this.logger.log(
                `EventSub redemption ${messageId} credited ${event.cost} points to twitch user ${event.userId}`,
            );
            return;
        }
        if (outcome === CreditOutcome.duplicate) {
            this.logger.debug(
                `EventSub redemption ${messageId} already processed`,
            );
            return;
        }
        this.logger.debug(
            `EventSub redemption ${messageId} ignored: twitch user ${event.userId} has no account`,
        );
    }

    private async recordStreamOnline(
        event: StreamOnlineEvent,
        messageId: string,
        now: Date,
    ): Promise<WebhookReply> {
        let outcome: StreamOnlineOutcome;
        try {
            outcome = await this.streamOnline.record(event, messageId, now);
        } catch (error) {
            this.logger.error(
                `EventSub stream.online ${messageId} not recorded (${describeError(error)}): Twitch will redeliver`,
            );
            return RETRY_LATER;
        }
        if (outcome === StreamOnlineOutcome.duplicate) {
            this.logger.debug(
                `EventSub stream.online ${messageId} already processed`,
            );
            return NO_CONTENT;
        }
        // fire-and-forget dopo l'insert: Twitch esige una risposta in pochi secondi, un invio FCM può durarne decine (C1)
        void this.push.broadcast(streamerLive()).catch(this.logPushFailure);
        this.logger.log(
            `EventSub stream.online ${messageId} (${event.type}) recorded: streamer-live push dispatched`,
        );
        return NO_CONTENT;
    }

    private readonly logPushFailure = (error: unknown): void => {
        this.logger.warn(
            `EventSub streamer-live push not sent: ${describeError(error)}`,
        );
    };
}
