import { TwitchHelixError } from 'src/eventsub/helix/twitch-helix.client';

export const HELIX_REQUEST_TIMEOUT_MS = 5000;

// i messaggi riportano solo operazione e status: mai token, client secret, secret EventSub o body Twitch (D-13)
export async function sendTwitchRequest(
    operation: string,
    url: string,
    init: RequestInit,
): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (error) {
        throw new TwitchHelixError(
            `${operation} request failed (${errorNameOf(error)})`,
        );
    }
}

export function assertTwitchOk(operation: string, response: Response): void {
    if (response.ok) return;
    throw new TwitchHelixError(
        `${operation} failed with status ${response.status}`,
        response.status,
    );
}

export async function readTwitchJson<T>(
    operation: string,
    response: Response,
): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw new TwitchHelixError(`${operation} response is not valid JSON`);
    }
}

// solo il name (TimeoutError, AbortError, TypeError), mai il message; letto per forma perché il DOMException può venire da un altro realm
function errorNameOf(error: unknown): string {
    if (typeof error !== 'object' || error === null) return 'UnknownError';
    const { name } = error as { name?: unknown };
    return typeof name === 'string' && name !== '' ? name : 'UnknownError';
}
