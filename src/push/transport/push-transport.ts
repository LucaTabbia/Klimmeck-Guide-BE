import { PushMessage } from 'src/push/push-message';

export const FCM_MULTICAST_LIMIT = 500;
export const PUSH_DISABLED_CODE = 'push-disabled';
export const TRANSPORT_ERROR_CODE = 'transport-error';

export interface TokenDeliveryOutcome {
    token: string;
    delivered: boolean;
    errorCode?: string;
}

export interface TopicDeliveryOutcome {
    delivered: boolean;
    errorCode?: string;
}

// porta verso FCM (D-07): PushService ne dipende, i test la sostituiscono; sendToTokens accetta al massimo FCM_MULTICAST_LIMIT token
export abstract class PushTransport {
    abstract readonly enabled: boolean;

    abstract sendToTokens(
        tokens: string[],
        message: PushMessage,
    ): Promise<TokenDeliveryOutcome[]>;

    abstract sendToTopic(
        topic: string,
        message: PushMessage,
    ): Promise<TopicDeliveryOutcome>;

    abstract subscribeToTopic(tokens: string[], topic: string): Promise<void>;

    abstract unsubscribeFromTopic(
        tokens: string[],
        topic: string,
    ): Promise<void>;
}
