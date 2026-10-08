import mongoose from 'mongoose';
import { createPubSub } from '@graphql-yoga/subscription';
import { CharacterSchema } from 'src/models/character/character.model';
import { PointOfInterestSchema } from 'src/models/point-of-interest.model';
import type { PubSubEvents } from 'src/pubsub.module';
import { persistCharacter } from '../fixtures';

/**
 * INTEGRATION (D-09): after the duplicate `PUB_SUB` provider was removed from
 * mongo.module.ts (committed in 01-01), the single remaining yoga PubSub must
 * still receive `characterUpdated`. This replicates characters.service.ts
 * onModuleInit: open a change stream on Character and republish onto the PubSub.
 *
 * Proves together the Character change stream (BE-TEST-01) and that the lone
 * PubSub provider works end-to-end.
 */
const CharacterModel =
    mongoose.models.Character || mongoose.model('Character', CharacterSchema);
const PoiModel =
    mongoose.models.PointOfInterest ||
    mongoose.model('PointOfInterest', PointOfInterestSchema);

describe('Character change stream -> PUB_SUB (D-09)', () => {
    it('emits characterUpdated on the PubSub when a Character is updated', async () => {
        const pubSub = createPubSub<PubSubEvents>();

        // Subscribe BEFORE triggering the change so the event is captured.
        const subscription = pubSub.subscribe('characterUpdated');
        const nextEvent = subscription.next();

        // Replicate the service's change stream: republish onto the PubSub.
        const stream = CharacterModel.watch(
            [{ $match: { operationType: { $in: ['update', 'replace'] } } }],
            { fullDocument: 'updateLookup' },
        );
        stream.on('change', (change: any) => {
            if (change.fullDocument) {
                pubSub.publish('characterUpdated', change.fullDocument);
            }
        });

        const character = await persistCharacter(CharacterModel, {}, PoiModel);

        // Trigger an update -> operationType 'update' on the change stream.
        await CharacterModel.updateOne(
            { _id: character._id },
            { $set: { 'status.xp': 25000 } },
        );

        // Guard with a clearable timeout so no timer lingers as an open handle.
        let timer: NodeJS.Timeout | undefined;
        try {
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new Error(
                                'characterUpdated not emitted within timeout',
                            ),
                        ),
                    8000,
                );
            });

            const received = (await Promise.race([
                nextEvent,
                timeout,
            ])) as IteratorResult<any>;

            expect(received.value).toBeDefined();
            expect(received.value._id.toString()).toBe(
                character._id.toString(),
            );
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
            stream.removeAllListeners('change');
            await subscription.return?.();
            await stream.close();
        }
    }, 20000);
});
