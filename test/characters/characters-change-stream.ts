import type { PubSub } from '@graphql-yoga/subscription';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../auth/auth-test-app';
import { withTimeout } from '../auth/ws-test-client';
import { createPlayer } from '../authz/player-fixture';

const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si scrive finché un evento arriva
export async function primeCharactersChangeStream(
    harness: AuthTestApp,
): Promise<void> {
    const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
    const characters = harness.connection.model<CharacterDocument>(
        Character.name,
    );
    const sentinel = await createPlayer(harness, {
        twitchId: 'twitch-sentinel',
    });
    const live = pubSub.subscribe('characterUpdated');
    const received = live.next();
    try {
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await characters.updateOne(
                { _id: sentinel.character?._id },
                { $set: { 'status.coins.copper': attempt } },
            );
            const delivered = await withTimeout(
                received,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (delivered) return;
        }
        throw new Error('change stream on characters never delivered an event');
    } finally {
        await live.return?.();
        await harness.clearDatabase();
    }
}
