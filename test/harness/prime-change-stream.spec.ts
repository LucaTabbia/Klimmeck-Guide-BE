import { createPubSub, type PubSub } from '@graphql-yoga/subscription';
import { PUB_SUB, type PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../auth/auth-test-app';
import { primeChangeStream, type PrimingTouch } from './prime-change-stream';

const PRIMING_TIMEOUT_MS = 15_000;

function harnessOver(pubSub: PubSub<PubSubEvents>): AuthTestApp {
    const app = {
        get: (token: unknown) => (token === PUB_SUB ? pubSub : null),
    };
    return { app } as unknown as AuthTestApp;
}

interface RecordedTouch {
    touch: PrimingTouch;
    writes: number[];
    cleanups: () => number;
}

function recordedTouch(
    publishOn: (attempt: number) => void,
    setup?: PrimingTouch['setup'],
): RecordedTouch {
    const writes: number[] = [];
    let cleanups = 0;
    return {
        touch: {
            setup,
            write: (attempt) => {
                writes.push(attempt);
                publishOn(attempt);
                return Promise.resolve();
            },
            cleanup: () => {
                cleanups += 1;
                return Promise.resolve();
            },
        },
        writes,
        cleanups: () => cleanups,
    };
}

describe('primeChangeStream', () => {
    it('touches the sentinel until the topic delivers, then cleans up once (D-17c)', async () => {
        const pubSub = createPubSub<PubSubEvents>();
        const recorded = recordedTouch((attempt) => {
            if (attempt === 3) {
                pubSub.publish('userUpdated', {
                    userUpdated:
                        {} as PubSubEvents['userUpdated'][0]['userUpdated'],
                });
            }
        });

        await primeChangeStream(
            harnessOver(pubSub),
            'userUpdated',
            recorded.touch,
        );

        expect(recorded.writes).toEqual([1, 2, 3]);
        expect(recorded.cleanups()).toBe(1);
    });

    it('subscribes a keyed topic with the id returned by the setup (D-17c)', async () => {
        const pubSub = createPubSub<PubSubEvents>();
        const recorded = recordedTouch(
            () => {
                pubSub.publish('questUpdated', 'sentinel-quest', {
                    questUpdated:
                        {} as PubSubEvents['questUpdated'][1]['questUpdated'],
                });
            },
            () => Promise.resolve('sentinel-quest'),
        );

        await primeChangeStream(
            harnessOver(pubSub),
            'questUpdated',
            recorded.touch,
        );

        expect(recorded.writes).toEqual([1]);
        expect(recorded.cleanups()).toBe(1);
    });

    it(
        'fails naming the topic when no event arrives and still cleans up (D-17c)',
        async () => {
            const pubSub = createPubSub<PubSubEvents>();
            const recorded = recordedTouch(() => undefined);

            await expect(
                primeChangeStream(
                    harnessOver(pubSub),
                    'characterUpdated',
                    recorded.touch,
                ),
            ).rejects.toThrow(
                'change stream for characterUpdated never delivered an event',
            );
            expect(recorded.writes).toHaveLength(25);
            expect(recorded.cleanups()).toBe(1);
        },
        PRIMING_TIMEOUT_MS,
    );
});
