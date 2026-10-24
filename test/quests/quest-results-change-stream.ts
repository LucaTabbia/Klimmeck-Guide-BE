import type { PubSub } from '@graphql-yoga/subscription';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../auth/auth-test-app';
import { withTimeout } from '../auth/ws-test-client';
import { persistQuestResult } from './quest-result.fixture';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si inseriscono risultati sentinella finché un evento arriva
export async function primeQuestResultsChangeStream(
    harness: AuthTestApp,
): Promise<void> {
    const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
    const results = harness.connection.model<QuestResultDocument>(
        QuestResult.name,
    );
    const live = pubSub.subscribe('questResultReceived');
    const received = live.next();
    try {
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await persistQuestResult(results);
            const delivered = await withTimeout(
                received,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (delivered) return;
        }
        throw new Error(
            'change stream on questresults never delivered an event',
        );
    } finally {
        await live.return?.();
        await harness.clearDatabase();
    }
}
