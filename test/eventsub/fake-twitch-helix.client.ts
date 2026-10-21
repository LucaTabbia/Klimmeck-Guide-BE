import {
    TwitchHelixClient,
    TwitchHelixError,
} from 'src/eventsub/helix/twitch-helix.client';
import type {
    CreateEventSubSubscriptionRequest,
    EventSubSubscription,
} from 'src/eventsub/helix/twitch-helix.client';
import { TEST_BROADCASTER_ID } from './eventsub-fixtures';
import { TEST_CALLBACK_URL } from './test-eventsub-config';

export type HelixCall =
    | { operation: 'list' }
    | { operation: 'create'; type: string }
    | { operation: 'delete'; id: string };

const FIRST_CREATED_AT_MS = Date.parse('2026-10-19T00:00:00.000Z');
const CREATED_AT_STEP_MS = 1000;
const PENDING_VERIFICATION = 'webhook_callback_verification_pending';

// sostituisce HttpTwitchHelixClient in unit e integration: nessuna rete, ogni chiamata registrata;
// i messaggi d'errore coincidono con quelli del client reale
export class FakeTwitchHelixClient extends TwitchHelixClient {
    readonly subscriptions: EventSubSubscription[] = [];
    readonly calls: HelixCall[] = [];
    readonly createRequests: CreateEventSubSubscriptionRequest[] = [];
    private listFailure: number | null = null;
    private readonly createFailures = new Map<string, number>();
    private readonly deleteFailures = new Map<string, number>();
    private created = 0;

    seed(
        subscription: Partial<EventSubSubscription> &
            Pick<EventSubSubscription, 'type'>,
    ): EventSubSubscription {
        const sequence = this.nextSequence();
        const seeded: EventSubSubscription = {
            id: `sub-${sequence}`,
            status: 'enabled',
            version: '1',
            condition: { broadcaster_user_id: TEST_BROADCASTER_ID },
            transport: { method: 'webhook', callback: TEST_CALLBACK_URL },
            createdAt: createdAtFor(sequence),
            ...subscription,
        };
        this.subscriptions.push(seeded);
        return copyOf(seeded);
    }

    setStatus(id: string, status: string): void {
        const subscription = this.subscriptions.find((item) => item.id === id);
        if (subscription) subscription.status = status;
    }

    failList(status: number): void {
        this.listFailure = status;
    }

    failCreate(type: string, status: number): void {
        this.createFailures.set(type, status);
    }

    failDelete(id: string, status: number): void {
        this.deleteFailures.set(id, status);
    }

    clearCalls(): void {
        this.calls.length = 0;
        this.createRequests.length = 0;
    }

    reset(): void {
        this.clearCalls();
        this.subscriptions.length = 0;
        this.listFailure = null;
        this.createFailures.clear();
        this.deleteFailures.clear();
        this.created = 0;
    }

    listEventSubSubscriptions(): Promise<EventSubSubscription[]> {
        this.calls.push({ operation: 'list' });
        if (this.listFailure !== null) {
            return rejectWith('Helix list subscriptions', this.listFailure);
        }
        return Promise.resolve(this.subscriptions.map(copyOf));
    }

    createEventSubSubscription(
        request: CreateEventSubSubscriptionRequest,
    ): Promise<EventSubSubscription> {
        this.calls.push({ operation: 'create', type: request.type });
        this.createRequests.push(structuredClone(request));
        const failure = this.createFailures.get(request.type);
        if (failure !== undefined) {
            return rejectWith('Helix create subscription', failure);
        }
        return Promise.resolve(
            this.seed({
                type: request.type,
                version: request.version,
                status: PENDING_VERIFICATION,
                condition: { ...request.condition },
                transport: {
                    method: request.transport.method,
                    callback: request.transport.callback,
                },
            }),
        );
    }

    deleteEventSubSubscription(id: string): Promise<void> {
        this.calls.push({ operation: 'delete', id });
        const failure = this.deleteFailures.get(id);
        if (failure !== undefined) {
            return rejectWith('Helix delete subscription', failure);
        }
        const index = this.subscriptions.findIndex((item) => item.id === id);
        if (index >= 0) this.subscriptions.splice(index, 1);
        return Promise.resolve();
    }

    private nextSequence(): number {
        this.created += 1;
        return this.created;
    }
}

function rejectWith(operation: string, status: number): Promise<never> {
    return Promise.reject(
        new TwitchHelixError(
            `${operation} failed with status ${status}`,
            status,
        ),
    );
}

function createdAtFor(sequence: number): string {
    return new Date(
        FIRST_CREATED_AT_MS + (sequence - 1) * CREATED_AT_STEP_MS,
    ).toISOString();
}

function copyOf(subscription: EventSubSubscription): EventSubSubscription {
    return structuredClone(subscription);
}
