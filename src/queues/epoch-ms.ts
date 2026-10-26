// i job delle code portano epoch ms, mai Date serializzate: dato della coda = input non fidato
export function isEpochMs(value: unknown): value is number {
    return (
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    );
}
