import { Repeater } from '@graphql-yoga/subscription';

// il Repeater del PubSub aggancia il listener solo al primo next(): va forzato PRIMA di leggere lo snapshot,
// così un evento pubblicato durante la lettura arriva dopo lo snapshot invece di perdersi (D-03)
export async function subscribeWithSnapshot<T>(
    live: AsyncIterable<T>,
    loadSnapshot: () => Promise<T>,
): Promise<AsyncIterableIterator<T>> {
    const iterator = live[Symbol.asyncIterator]();
    const firstLive = iterator.next();
    let snapshot: T;
    try {
        snapshot = await loadSnapshot();
    } catch (error) {
        // il live non deve mai diventare un unhandledRejection, né mascherare l'errore dello snapshot
        firstLive.catch(() => undefined);
        await iterator.return?.().catch(() => undefined);
        throw error;
    }
    return new Repeater<T>(async (push, stop) => {
        // ogni attesa del live corre contro lo stop: return() a vuoto non resta appeso a un next() pendente
        const stopped = stop.then(
            (): IteratorResult<T> => ({ done: true, value: undefined }),
        );
        void stopped.then(() => iterator.return?.()).catch(() => undefined);
        await push(snapshot);
        for (
            let result = await Promise.race([firstLive, stopped]);
            !result.done;
            result = await Promise.race([iterator.next(), stopped])
        ) {
            await push(result.value);
        }
        stop();
    });
}
