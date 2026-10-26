import type { PubSub } from '@graphql-yoga/subscription';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../auth/auth-test-app';
import { withTimeout } from '../auth/ws-test-client';
import { persistQuest } from '../fixtures';
import { waitForQuiet } from './pending-requests-change-stream';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si aggiorna una sola quest sentinella finché un evento arriva.
// Gli update tardivi della sentinella si esauriscono prima che sparisca: nessun «conclusa o sparita» nei test successivi
export async function primeQuestsChangeStream(
    harness: AuthTestApp,
): Promise<void> {
    const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
    const quests = harness.connection.model<QuestDocument>(Quest.name);
    const sentinel = await persistQuest(quests);
    const live = pubSub.subscribe('questUpdated', String(sentinel._id));
    try {
        const received = live.next();
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await quests.updateOne(
                { _id: sentinel._id },
                { $set: { 'infos.title': `Sentinella ${attempt}` } },
            );
            const delivered = await withTimeout(
                received,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (delivered) {
                await waitForQuiet(live);
                return;
            }
        }
        throw new Error('change stream on quests never delivered an event');
    } finally {
        await live.return?.();
        await quests.deleteOne({ _id: sentinel._id });
    }
}
