import {
    PUSH_DISABLED_CODE,
    PushTransport,
    TokenDeliveryOutcome,
    TopicDeliveryOutcome,
} from 'src/push/transport/push-transport';

// credenziali Firebase assenti (dev/test): il dominio resta invariato, nessun invio parte
export class NoopPushTransport extends PushTransport {
    readonly enabled = false;

    sendToTokens(tokens: string[]): Promise<TokenDeliveryOutcome[]> {
        return Promise.resolve(
            tokens.map((token) => ({
                token,
                delivered: false,
                errorCode: PUSH_DISABLED_CODE,
            })),
        );
    }

    sendToTopic(): Promise<TopicDeliveryOutcome> {
        return Promise.resolve({
            delivered: false,
            errorCode: PUSH_DISABLED_CODE,
        });
    }

    subscribeToTopic(): Promise<void> {
        return Promise.resolve();
    }

    unsubscribeFromTopic(): Promise<void> {
        return Promise.resolve();
    }
}
