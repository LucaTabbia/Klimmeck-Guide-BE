import { createPubSub } from '@graphql-yoga/subscription';
import { SubscriberRegistry } from './subscriber-registry';

type Events = { questUpdated: [id: string, payload: { title: string }] };

const QUEST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TOPIC = `questUpdated:${QUEST_ID}`;

describe('SubscriberRegistry', () => {
    let registry: SubscriberRegistry;
    let pubSub: ReturnType<typeof createPubSub<Events>>;

    beforeEach(() => {
        registry = new SubscriberRegistry();
        pubSub = createPubSub<Events>({ eventTarget: registry });
    });

    it('reports no subscriber for a topic nobody listens to', () => {
        expect(registry.hasSubscribers(TOPIC)).toBe(false);
    });

    it('counts a subscription from its first pull until it is returned', async () => {
        const first = pubSub.subscribe('questUpdated', QUEST_ID);
        const second = pubSub.subscribe('questUpdated', QUEST_ID);
        const firstEvent = first.next();
        void second.next();
        expect(registry.hasSubscribers(TOPIC)).toBe(true);

        await first.return();
        expect(registry.hasSubscribers(TOPIC)).toBe(true);
        await second.return();
        expect(registry.hasSubscribers(TOPIC)).toBe(false);
        expect(await firstEvent).toEqual({ done: true, value: undefined });
    });

    it('delivers a publish to the subscribers of the same topic only', async () => {
        const listener = pubSub.subscribe('questUpdated', QUEST_ID);
        const received = listener.next();

        pubSub.publish('questUpdated', 'bbbbbbbbbbbbbbbbbbbbbbbb', {
            title: 'other',
        });
        pubSub.publish('questUpdated', QUEST_ID, { title: 'mine' });

        expect(await received).toEqual({
            done: false,
            value: { title: 'mine' },
        });
        await listener.return();
    });
});
