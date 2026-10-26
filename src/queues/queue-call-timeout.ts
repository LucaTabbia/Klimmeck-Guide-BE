// una chiamata Bull con Redis giù attende il riconnesso all'infinito: la corsa col timer tiene le mutation entro un tempo noto (D-21)
export const QUEUE_CALL_TIMEOUT_MS = 2_000;
export const QUEUE_CALL_TIMEOUT = 'QUEUE_CALL_TIMEOUT';
export const QUEUE_CALL_TIMED_OUT: unique symbol = Symbol('queueCallTimedOut');

export async function withinTimeout<T>(
    call: Promise<T>,
    timeoutMs: number,
): Promise<T | typeof QUEUE_CALL_TIMED_OUT> {
    // un esito tardivo non deve diventare una unhandled rejection
    void call.catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<typeof QUEUE_CALL_TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(QUEUE_CALL_TIMED_OUT), timeoutMs);
        timer.unref();
    });
    try {
        return await Promise.race([call, timedOut]);
    } finally {
        clearTimeout(timer);
    }
}
