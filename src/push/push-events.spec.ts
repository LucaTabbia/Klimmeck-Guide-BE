import {
    questEnd,
    streamerLive,
    testPushMessage,
    travelEnd,
} from 'src/push/push-events';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushMessage, STREAMER_LIVE_TOPIC } from 'src/push/push-message';

const BUILDERS: Record<PushEventType, (id: string) => PushMessage> = {
    [PushEventType.travelEnd]: travelEnd,
    [PushEventType.questEnd]: questEnd,
    [PushEventType.streamerLive]: () => streamerLive(),
};
const IDENTIFIED_TYPES = [PushEventType.travelEnd, PushEventType.questEnd];

describe('push event catalog', () => {
    it('builds travelEnd with the character id and a 1 h ttl', () => {
        expect(travelEnd('64b0000000000000000000c1')).toEqual({
            type: PushEventType.travelEnd,
            id: '64b0000000000000000000c1',
            title: 'Viaggio completato',
            body: 'Il tuo personaggio è arrivato a destinazione.',
            ttlSeconds: 3600,
        });
    });

    it('builds questEnd with the quest result id and a 1 h ttl', () => {
        expect(questEnd('64b0000000000000000000d1')).toEqual({
            type: PushEventType.questEnd,
            id: '64b0000000000000000000d1',
            title: 'Missione conclusa',
            body: "La tua missione è terminata: scopri com'è andata.",
            ttlSeconds: 3600,
        });
    });

    it('builds streamerLive without an id and a 15 min ttl', () => {
        expect(streamerLive()).toEqual({
            type: PushEventType.streamerLive,
            title: 'La locanda è aperta',
            body: "Lo streamer è in diretta: unisciti all'avventura!",
            ttlSeconds: 900,
        });
        expect(streamerLive()).not.toHaveProperty('id');
    });

    it.each(Object.values(PushEventType))(
        'testPushMessage(%s) reuses the catalog copy',
        (type) => {
            const message = testPushMessage(type, 'abc');
            const built = BUILDERS[type]('abc');

            expect(message).toMatchObject({
                type: built.type,
                title: built.title,
                body: built.body,
                ttlSeconds: built.ttlSeconds,
            });
            if (IDENTIFIED_TYPES.includes(type)) {
                expect(message.id).toBe('abc');
            } else {
                expect(message).not.toHaveProperty('id');
            }
        },
    );

    it.each([undefined, ''])(
        'testPushMessage omits the id when it is %p',
        (id) => {
            expect(
                testPushMessage(PushEventType.travelEnd, id),
            ).not.toHaveProperty('id');
        },
    );

    it.each([
        [
            'travelEnd',
            travelEnd('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'questEnd',
            questEnd('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'streamerLive',
            streamerLive(),
            ['body', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'testPushMessage(questEnd)',
            testPushMessage(PushEventType.questEnd, 'a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'testPushMessage(streamerLive)',
            testPushMessage(PushEventType.streamerLive, 'a'),
            ['body', 'title', 'ttlSeconds', 'type'],
        ],
    ])(
        '%s carries exactly the keys type,title,body,ttlSeconds[,id]',
        (_name, message, keys) => {
            expect(Object.keys(message).sort()).toEqual(keys);
        },
    );

    it('exposes a valid FCM topic name for streamerLive', () => {
        expect(STREAMER_LIVE_TOPIC).toBe('streamer-live');
        expect(STREAMER_LIVE_TOPIC).toMatch(/^[a-zA-Z0-9-_.~%]+$/);
    });
});
