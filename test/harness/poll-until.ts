export interface PollOptions {
    intervalMs: number;
    attempts: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// budget fisso di tentativi più un'ultima lettura dopo l'ultima attesa: true appena il predicato è vero
export async function pollUntil(
    predicate: () => boolean | Promise<boolean>,
    { intervalMs, attempts }: PollOptions,
): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (await predicate()) return true;
        await sleep(intervalMs);
    }
    return predicate();
}
