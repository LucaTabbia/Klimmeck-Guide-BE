import { createClient } from 'graphql-ws';
import type { FormattedExecutionResult } from 'graphql-ws';
import WebSocket from 'ws';
import { GRAPHQL_PATH } from 'src/graphql/graphql-context';

export const GRAPHQL_TRANSPORT_WS_PROTOCOL = 'graphql-transport-ws';
const DEFAULT_TIMEOUT_MS = 5000;

export interface WsCloseEvent {
    code: number;
    reason: string;
    acknowledged: boolean;
}

export interface WsConnectOptions {
    subprotocols?: string[];
    timeoutMs?: number;
}

export interface AcknowledgedSocket {
    socket: WebSocket;
    closed: Promise<WsCloseEvent>;
}

interface TrackedSocket {
    socket: WebSocket;
    acknowledged: Promise<void>;
    closed: Promise<WsCloseEvent>;
}

export function graphqlWsUrl(port: number): string {
    return `ws://127.0.0.1:${port}${GRAPHQL_PATH}`;
}

function isConnectionAck(data: WebSocket.RawData): boolean {
    const message = JSON.parse((data as Buffer).toString('utf8')) as {
        type?: unknown;
    };
    return message.type === 'connection_ack';
}

// socket grezzo: invia connection_init all'open, traccia ack e chiusura; il timeout termina il socket
// così nessun handle sopravvive al test
function openTrackedSocket(
    url: string,
    payload: Record<string, unknown> | undefined,
    options: WsConnectOptions,
): TrackedSocket {
    const socket = new WebSocket(
        url,
        options.subprotocols ?? [GRAPHQL_TRANSPORT_WS_PROTOCOL],
    );
    let acknowledged = false;
    let resolveAck: () => void = () => undefined;
    let rejectAck: (error: Error) => void = () => undefined;
    const ack = new Promise<void>((resolve, reject) => {
        resolveAck = resolve;
        rejectAck = reject;
    });
    const timeout = setTimeout(
        () => socket.terminate(),
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const closed = new Promise<WsCloseEvent>((resolve) => {
        socket.on('close', (code, reason) => {
            clearTimeout(timeout);
            const event = { code, reason: reason.toString(), acknowledged };
            rejectAck(
                new Error(
                    `socket closed before connection_ack: ${code} ${event.reason}`,
                ),
            );
            resolve(event);
        });
    });
    socket.on('open', () =>
        socket.send(JSON.stringify({ type: 'connection_init', payload })),
    );
    socket.on('message', (data) => {
        if (!isConnectionAck(data)) return;
        acknowledged = true;
        resolveAck();
    });
    socket.on('error', () => undefined);

    return { socket, acknowledged: ack, closed };
}

export function connectAndAwaitClose(
    url: string,
    payload?: Record<string, unknown>,
    options: WsConnectOptions = {},
): Promise<WsCloseEvent> {
    const tracked = openTrackedSocket(url, payload, options);
    tracked.acknowledged.catch(() => undefined);
    return tracked.closed;
}

export async function openAcknowledgedSocket(
    url: string,
    payload: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<AcknowledgedSocket> {
    const tracked = openTrackedSocket(url, payload, { timeoutMs });
    await tracked.acknowledged;
    return { socket: tracked.socket, closed: tracked.closed };
}

export async function subscribeOnce(
    url: string,
    connectionParams: Record<string, unknown>,
    query: string,
): Promise<unknown> {
    const client = createClient({
        url,
        webSocketImpl: WebSocket,
        connectionParams,
        retryAttempts: 0,
        lazy: true,
    });
    const iterator = client.iterate({ query });
    try {
        const { value } = await iterator.next();
        return value;
    } finally {
        await iterator.return?.();
        await client.dispose();
    }
}

export interface OpenSubscription<T> {
    next(
        timeoutMs?: number,
    ): Promise<IteratorResult<FormattedExecutionResult<T, unknown>>>;
    dispose(): Promise<void>;
}

// timer sempre ripulito: nessun handle aperto a fine test
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () =>
                reject(
                    new Error(
                        `subscription result timed out after ${timeoutMs} ms`,
                    ),
                ),
            timeoutMs,
        );
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

// stream WS multi-evento: ogni next() ha il suo timeout, dispose() chiude iteratore e client
export function openSubscription<T>(
    url: string,
    connectionParams: Record<string, unknown>,
    payload: { query: string; variables?: Record<string, unknown> },
): OpenSubscription<T> {
    const client = createClient({
        url,
        webSocketImpl: WebSocket,
        connectionParams,
        retryAttempts: 0,
        lazy: true,
    });
    const iterator = client.iterate<T>(payload);
    return {
        next: (timeoutMs = DEFAULT_TIMEOUT_MS) =>
            withTimeout(iterator.next(), timeoutMs),
        async dispose() {
            await iterator.return?.();
            await client.dispose();
        },
    };
}

// prova negativa limitata: usare SOLO dopo un evento sentinella già ricevuto altrove (Pitfall 12)
export async function expectSilence<T>(
    subscription: OpenSubscription<T>,
    windowMs = 500,
): Promise<void> {
    const outcome = await subscription.next(windowMs).then(
        (result) => ({ received: result }),
        () => ({ received: undefined }),
    );
    if (outcome.received) {
        throw new Error(
            `unexpected subscription result: ${JSON.stringify(outcome.received)}`,
        );
    }
}
