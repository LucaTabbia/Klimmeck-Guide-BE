import { Inject, Injectable } from '@nestjs/common';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import type { EventSubConfig } from 'src/config/eventsub-config';
import {
    NOT_MANAGED_MESSAGE,
    TwitchAppTokenCache,
} from 'src/eventsub/helix/twitch-app-token.cache';
import {
    TwitchHelixClient,
    TwitchHelixError,
} from 'src/eventsub/helix/twitch-helix.client';
import type {
    CreateEventSubSubscriptionRequest,
    EventSubSubscription,
} from 'src/eventsub/helix/twitch-helix.client';
import {
    assertTwitchOk,
    HELIX_REQUEST_TIMEOUT_MS,
    readTwitchJson,
    sendTwitchRequest,
} from 'src/eventsub/helix/twitch-http';

export const HELIX_EVENTSUB_SUBSCRIPTIONS_URL =
    'https://api.twitch.tv/helix/eventsub/subscriptions';
export const MAX_SUBSCRIPTION_PAGES = 20;

const LIST_OPERATION = 'Helix list subscriptions';
const CREATE_OPERATION = 'Helix create subscription';
const DELETE_OPERATION = 'Helix delete subscription';
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

interface HelixListResponse {
    data?: unknown;
    pagination?: { cursor?: unknown };
}

interface HelixCreateResponse {
    data?: unknown;
}

@Injectable()
export class HttpTwitchHelixClient extends TwitchHelixClient {
    constructor(
        @Inject(EVENTSUB_CONFIG) private readonly config: EventSubConfig,
        private readonly tokens: TwitchAppTokenCache,
    ) {
        super();
    }

    async listEventSubSubscriptions(): Promise<EventSubSubscription[]> {
        const subscriptions: EventSubSubscription[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < MAX_SUBSCRIPTION_PAGES; page += 1) {
            const body = await this.fetchListPage(cursor);
            subscriptions.push(...toSubscriptions(body.data));
            cursor = nextCursor(body);
            if (cursor === undefined) return subscriptions;
        }
        throw new TwitchHelixError(
            `${LIST_OPERATION} exceeded ${MAX_SUBSCRIPTION_PAGES} pages`,
        );
    }

    async createEventSubSubscription(
        request: CreateEventSubSubscriptionRequest,
    ): Promise<EventSubSubscription> {
        const response = await this.authorizedRequest(
            CREATE_OPERATION,
            new URL(HELIX_EVENTSUB_SUBSCRIPTIONS_URL),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            },
        );
        assertTwitchOk(CREATE_OPERATION, response);
        const body = await readTwitchJson<HelixCreateResponse>(
            CREATE_OPERATION,
            response,
        );
        const [created] = toSubscriptions(body.data);
        if (!created) {
            throw new TwitchHelixError(
                `${CREATE_OPERATION} response is missing the subscription`,
            );
        }
        return created;
    }

    async deleteEventSubSubscription(id: string): Promise<void> {
        const url = new URL(HELIX_EVENTSUB_SUBSCRIPTIONS_URL);
        url.searchParams.set('id', id);
        const response = await this.authorizedRequest(DELETE_OPERATION, url, {
            method: 'DELETE',
        });
        if (response.status === HTTP_NOT_FOUND) return;
        assertTwitchOk(DELETE_OPERATION, response);
    }

    private async fetchListPage(
        cursor: string | undefined,
    ): Promise<HelixListResponse> {
        const url = new URL(HELIX_EVENTSUB_SUBSCRIPTIONS_URL);
        if (cursor !== undefined) url.searchParams.set('after', cursor);
        const response = await this.authorizedRequest(LIST_OPERATION, url, {
            method: 'GET',
        });
        assertTwitchOk(LIST_OPERATION, response);
        return readTwitchJson<HelixListResponse>(LIST_OPERATION, response);
    }

    // un 401 indica un app token revocato o scaduto: se ne chiede uno nuovo e si ritenta una sola volta
    private async authorizedRequest(
        operation: string,
        url: URL,
        init: RequestInit,
    ): Promise<Response> {
        const response = await this.sendAuthorized(operation, url, init);
        if (response.status !== HTTP_UNAUTHORIZED) return response;
        this.tokens.invalidate();
        return this.sendAuthorized(operation, url, init);
    }

    private async sendAuthorized(
        operation: string,
        url: URL,
        init: RequestInit,
    ): Promise<Response> {
        const clientId = this.requireClientId();
        const accessToken = await this.tokens.getToken();
        return sendTwitchRequest(operation, url.toString(), {
            ...init,
            headers: {
                ...(init.headers as Record<string, string> | undefined),
                Authorization: `Bearer ${accessToken}`,
                'Client-Id': clientId,
            },
            signal: AbortSignal.timeout(HELIX_REQUEST_TIMEOUT_MS),
        });
    }

    private requireClientId(): string {
        if (this.config.mode !== 'managed') {
            throw new TwitchHelixError(NOT_MANAGED_MESSAGE);
        }
        return this.config.clientId;
    }
}

function nextCursor(body: HelixListResponse): string | undefined {
    const cursor = body.pagination?.cursor;
    return typeof cursor === 'string' && cursor !== '' ? cursor : undefined;
}

function toSubscriptions(data: unknown): EventSubSubscription[] {
    if (!Array.isArray(data)) return [];
    return data
        .map(toSubscription)
        .filter(
            (subscription): subscription is EventSubSubscription =>
                subscription !== null,
        );
}

// il body Helix non è fidato: forma variabile e condition talvolta serializzata come stringa JSON
function toSubscription(raw: unknown): EventSubSubscription | null {
    if (!isRecord(raw)) return null;
    if (typeof raw.id !== 'string' || raw.id === '') return null;
    const transport = isRecord(raw.transport) ? raw.transport : {};
    return {
        id: raw.id,
        status: stringOrEmpty(raw.status),
        type: stringOrEmpty(raw.type),
        version: stringOrEmpty(raw.version),
        condition: toCondition(raw.condition),
        transport: {
            method: stringOrEmpty(transport.method),
            callback:
                typeof transport.callback === 'string'
                    ? transport.callback
                    : null,
        },
        createdAt: stringOrEmpty(raw.created_at),
    };
}

function toCondition(condition: unknown): Record<string, unknown> {
    if (isRecord(condition)) return condition;
    if (typeof condition !== 'string') return {};
    try {
        const parsed: unknown = JSON.parse(condition);
        return isRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : '';
}
