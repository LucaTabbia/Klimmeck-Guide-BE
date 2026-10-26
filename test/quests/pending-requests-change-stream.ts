import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../auth/auth-test-app';
import { withTimeout } from '../auth/ws-test-client';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;
// i delete della pulizia ricalcolano la coda: si attende che le liste tardive smettano di arrivare
const QUIET_WINDOW_MS = 300;

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si inseriscono PendingQuest sentinella finché una lista arriva
export async function primePendingRequestsChangeStream(
    harness: AuthTestApp,
): Promise<void> {
    const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
    const pendingQuests = harness.connection.model<PendingQuestDocument>(
        PendingQuest.name,
    );
    const live = pubSub.subscribe('pendingRequestsUpdated');
    try {
        await deliverSentinel(pendingQuests, live);
        await harness.clearDatabase();
        await waitForQuiet(live);
    } finally {
        await live.return?.();
    }
}

async function deliverSentinel(
    pendingQuests: Model<PendingQuestDocument>,
    live: AsyncIterableIterator<unknown>,
): Promise<void> {
    const received = live.next();
    for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
        await pendingQuests.create({
            startDate: null,
            waitingTime: 0,
            pointsSpent: 0,
            quest: new Types.ObjectId(),
        });
        const delivered = await withTimeout(received, PRIMING_WAIT_MS).catch(
            () => undefined,
        );
        if (delivered) return;
    }
    throw new Error('change stream on pendingquests never delivered an event');
}

// gli eventi tardivi di una raffica arrivano ancora dopo il primo: si attende che smettano
export async function waitForQuiet(live: AsyncIterableIterator<unknown>) {
    let pending = live.next();
    for (;;) {
        const delivered = await withTimeout(pending, QUIET_WINDOW_MS).catch(
            () => undefined,
        );
        if (!delivered) return;
        pending = live.next();
    }
}
