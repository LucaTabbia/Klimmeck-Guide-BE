import { Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../auth/auth-test-app';
import { withTimeout } from '../auth/ws-test-client';
import { createPlayer } from '../authz/player-fixture';
import { persistQuest } from '../fixtures';
import { persistQuestResult } from '../quests/quest-result.fixture';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;
// gli eventi tardivi di una raffica arrivano ancora dopo il primo: si attende una finestra senza eventi
const QUIET_WINDOW_MS = 300;

export interface PrimingTouch {
    // crea la sentinella; restituisce l'id solo per un topic con chiave (questUpdated)
    setup?: () => Promise<string | undefined>;
    write: (attempt: number) => Promise<void>;
    cleanup: () => Promise<void>;
}

// il topic arriva come stringa: la firma tipizzata di subscribe vuole un letterale noto
interface TopicSubscriber {
    subscribe(topic: string, key?: string): AsyncIterableIterator<unknown>;
}

function subscribeTo(
    harness: AuthTestApp,
    topic: keyof PubSubEvents,
    key: string | undefined,
): AsyncIterableIterator<unknown> {
    const pubSub = harness.app.get<TopicSubscriber>(PUB_SUB);
    return key === undefined
        ? pubSub.subscribe(topic)
        : pubSub.subscribe(topic, key);
}

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si tocca la sentinella finché un evento arriva
export async function primeChangeStream(
    harness: AuthTestApp,
    topic: keyof PubSubEvents,
    touch: PrimingTouch,
): Promise<void> {
    const key = await touch.setup?.();
    const live = subscribeTo(harness, topic, key);
    try {
        const received = live.next();
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await touch.write(attempt);
            const delivered = await withTimeout(
                received,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (delivered) {
                await waitForQuiet(live);
                return;
            }
        }
        throw new Error(`change stream for ${topic} never delivered an event`);
    } finally {
        await live.return?.();
        await touch.cleanup();
    }
}

export async function waitForQuiet(
    live: AsyncIterableIterator<unknown>,
): Promise<void> {
    let pending = live.next();
    for (;;) {
        const delivered = await withTimeout(pending, QUIET_WINDOW_MS).catch(
            () => undefined,
        );
        if (!delivered) return;
        pending = live.next();
    }
}

export function characterTouch(harness: AuthTestApp): PrimingTouch {
    const characters = harness.connection.model<CharacterDocument>(
        Character.name,
    );
    let sentinelId: unknown;
    return {
        setup: async () => {
            const sentinel = await createPlayer(harness, {
                twitchId: 'twitch-sentinel',
            });
            sentinelId = sentinel.character?._id;
            return undefined;
        },
        write: async (attempt) => {
            await characters.updateOne(
                { _id: sentinelId },
                { $set: { 'status.coins.copper': attempt } },
            );
        },
        cleanup: () => harness.clearDatabase(),
    };
}

export function questResultTouch(harness: AuthTestApp): PrimingTouch {
    const results = harness.connection.model<QuestResultDocument>(
        QuestResult.name,
    );
    return {
        write: async () => {
            await persistQuestResult(results);
        },
        cleanup: () => harness.clearDatabase(),
    };
}

// la pulizia ricalcola la coda: si attende che le liste tardive smettano di arrivare
export function pendingQuestTouch(harness: AuthTestApp): PrimingTouch {
    const pendingQuests = harness.connection.model<PendingQuestDocument>(
        PendingQuest.name,
    );
    return {
        write: async () => {
            await pendingQuests.create({
                startDate: null,
                waitingTime: 0,
                pointsSpent: 0,
                quest: new Types.ObjectId(),
            });
        },
        cleanup: async () => {
            const late = subscribeTo(
                harness,
                'pendingRequestsUpdated',
                undefined,
            );
            try {
                await harness.clearDatabase();
                await waitForQuiet(late);
            } finally {
                await late.return?.();
            }
        },
    };
}

// una sola quest sentinella aggiornata: gli update tardivi si esauriscono prima che sparisca
export function questTouch(harness: AuthTestApp): PrimingTouch {
    const quests = harness.connection.model<QuestDocument>(Quest.name);
    let sentinelId: unknown;
    return {
        setup: async () => {
            const sentinel = await persistQuest(quests);
            sentinelId = sentinel._id;
            return String(sentinel._id);
        },
        write: async (attempt) => {
            await quests.updateOne(
                { _id: sentinelId },
                { $set: { 'infos.title': `Sentinella ${attempt}` } },
            );
        },
        cleanup: async () => {
            await quests.deleteOne({ _id: sentinelId });
        },
    };
}
