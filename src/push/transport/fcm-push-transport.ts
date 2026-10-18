import { Logger } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import {
    getMessaging,
    type Messaging,
    type MessagingTopicManagementResponse,
} from 'firebase-admin/messaging';
import { Clock } from 'src/auth/clock';
import type { FirebaseServiceAccount } from 'src/config/push-config';
import { PushMessage } from 'src/push/push-message';
import { toFcmBase } from 'src/push/transport/fcm-message';
import {
    PushTransport,
    TokenDeliveryOutcome,
    TopicDeliveryOutcome,
    TRANSPORT_ERROR_CODE,
} from 'src/push/transport/push-transport';

export const FCM_APP_NAME = 'klimmeck-push';

export class FcmPushTransport extends PushTransport {
    readonly enabled = true;
    private readonly logger = new Logger('Push');

    constructor(
        private readonly messaging: Messaging,
        private readonly clock: Clock,
    ) {
        super();
    }

    // nessuna chiamata di rete: il token OAuth arriva al primo invio; una seconda initializeApp con lo stesso nome lancerebbe
    static connect(
        account: FirebaseServiceAccount,
        clock: Clock,
    ): FcmPushTransport {
        const app =
            getApps().find((candidate) => candidate.name === FCM_APP_NAME) ??
            initializeApp({ credential: cert(account) }, FCM_APP_NAME);
        return new FcmPushTransport(getMessaging(app), clock);
    }

    async sendToTokens(
        tokens: string[],
        message: PushMessage,
    ): Promise<TokenDeliveryOutcome[]> {
        try {
            // l'await dentro il try cattura anche il throw sincrono dell'SDK (0 o > 500 token)
            const batch = await this.messaging.sendEachForMulticast({
                tokens,
                ...toFcmBase(message, this.clock.now()),
            });
            return batch.responses.map((response, index) => ({
                token: tokens[index],
                delivered: response.success,
                errorCode: response.error?.code,
            }));
        } catch (error) {
            const errorCode = fcmErrorCodeOf(error);
            return tokens.map((token) => ({
                token,
                delivered: false,
                errorCode,
            }));
        }
    }

    async sendToTopic(
        topic: string,
        message: PushMessage,
    ): Promise<TopicDeliveryOutcome> {
        try {
            await this.messaging.send({
                topic,
                ...toFcmBase(message, this.clock.now()),
            });
            return { delivered: true };
        } catch (error) {
            return { delivered: false, errorCode: fcmErrorCodeOf(error) };
        }
    }

    async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
        this.reportTopicFailures(
            'subscribeToTopic',
            topic,
            await this.messaging.subscribeToTopic(tokens, topic),
        );
    }

    async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
        this.reportTopicFailures(
            'unsubscribeFromTopic',
            topic,
            await this.messaging.unsubscribeFromTopic(tokens, topic),
        );
    }

    // i fallimenti per-token della gestione topic risolvono invece di lanciare: si loggano solo codici, mai token
    private reportTopicFailures(
        operation: string,
        topic: string,
        response: MessagingTopicManagementResponse,
    ): void {
        if (response.failureCount === 0) return;
        const codes = response.errors.map(({ error }) => error.code).join(', ');
        this.logger.warn(
            `${operation}(${topic}): ${response.failureCount} token failed (${codes})`,
        );
    }
}

// firebase-admin 13 e 14 espongono entrambi error.code = "messaging/<code>": mai l'enum, rinominato in 14
function fcmErrorCodeOf(error: unknown): string {
    const code =
        typeof error === 'object' && error !== null
            ? (error as { code?: unknown }).code
            : undefined;
    return typeof code === 'string' ? code : TRANSPORT_ERROR_CODE;
}
