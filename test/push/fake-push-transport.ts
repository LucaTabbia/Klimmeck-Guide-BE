import { PushMessage } from 'src/push/push-message';
import {
    PushTransport,
    TokenDeliveryOutcome,
    TopicDeliveryOutcome,
} from 'src/push/transport/push-transport';

interface TopicManagementCall {
    tokens: string[];
    topic: string;
}

// sostituisce FcmPushTransport in unit e integration: nessuna rete, ogni chiamata registrata
export class FakePushTransport extends PushTransport {
    enabled = true;
    readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
    readonly topicSends: Array<{ topic: string; message: PushMessage }> = [];
    readonly subscriptions: TopicManagementCall[] = [];
    readonly unsubscriptions: TopicManagementCall[] = [];
    private readonly tokenFailures = new Map<string, string>();
    private topicSendFailure: string | null = null;
    private topicManagementFailure: Error | null = null;

    failToken(token: string, errorCode: string): void {
        this.tokenFailures.set(token, errorCode);
    }

    failTopicSend(errorCode: string): void {
        this.topicSendFailure = errorCode;
    }

    failTopicManagement(error: Error): void {
        this.topicManagementFailure = error;
    }

    reset(): void {
        this.enabled = true;
        this.sent.length = 0;
        this.topicSends.length = 0;
        this.subscriptions.length = 0;
        this.unsubscriptions.length = 0;
        this.tokenFailures.clear();
        this.topicSendFailure = null;
        this.topicManagementFailure = null;
    }

    sendToTokens(
        tokens: string[],
        message: PushMessage,
    ): Promise<TokenDeliveryOutcome[]> {
        this.sent.push({ tokens: [...tokens], message });
        return Promise.resolve(tokens.map((token) => this.tokenOutcome(token)));
    }

    sendToTopic(
        topic: string,
        message: PushMessage,
    ): Promise<TopicDeliveryOutcome> {
        this.topicSends.push({ topic, message });
        if (this.topicSendFailure === null) {
            return Promise.resolve({ delivered: true });
        }
        return Promise.resolve({
            delivered: false,
            errorCode: this.topicSendFailure,
        });
    }

    subscribeToTopic(tokens: string[], topic: string): Promise<void> {
        this.subscriptions.push({ tokens: [...tokens], topic });
        return this.topicManagementResult();
    }

    unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
        this.unsubscriptions.push({ tokens: [...tokens], topic });
        return this.topicManagementResult();
    }

    private tokenOutcome(token: string): TokenDeliveryOutcome {
        const errorCode = this.tokenFailures.get(token);
        if (errorCode === undefined) return { token, delivered: true };
        return { token, delivered: false, errorCode };
    }

    private topicManagementResult(): Promise<void> {
        if (this.topicManagementFailure) {
            return Promise.reject(this.topicManagementFailure);
        }
        return Promise.resolve();
    }
}
