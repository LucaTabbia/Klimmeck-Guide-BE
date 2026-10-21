export interface EventSubTransportInfo {
    method: string;
    callback: string | null;
}

export interface EventSubSubscription {
    id: string;
    status: string;
    type: string;
    version: string;
    condition: Record<string, unknown>;
    transport: EventSubTransportInfo;
    createdAt: string;
}

export interface CreateEventSubSubscriptionRequest {
    type: string;
    version: string;
    condition: { broadcaster_user_id: string };
    transport: { method: 'webhook'; callback: string; secret: string };
}

export class TwitchHelixError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'TwitchHelixError';
    }
}

// di un errore estraneo si espone solo il name: il suo message potrebbe contenere segreti
export function describeHelixError(error: unknown): string {
    if (error instanceof TwitchHelixError) return error.message;
    if (error instanceof Error) return error.name;
    return 'UnknownError';
}

export abstract class TwitchHelixClient {
    abstract listEventSubSubscriptions(): Promise<EventSubSubscription[]>;
    abstract createEventSubSubscription(
        request: CreateEventSubSubscriptionRequest,
    ): Promise<EventSubSubscription>;
    abstract deleteEventSubSubscription(id: string): Promise<void>;
}
