import { PushEventType } from 'src/push/push-event-type.enum';
import {
    questEnd,
    streamerLive,
    testPushMessage,
    travelEnd,
} from 'src/push/push-events';
import { toFcmBase } from 'src/push/transport/fcm-message';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const NOW_EPOCH_SECONDS = Math.floor(NOW.getTime() / 1000);

describe('toFcmBase', () => {
    it('carries the event as string-only data with the send timestamp', () => {
        expect(toFcmBase(travelEnd('c1'), NOW).data).toEqual({
            type: 'travelEnd',
            id: 'c1',
            title: 'Viaggio completato',
            body: 'Il tuo personaggio è arrivato a destinazione.',
            sentAt: '2026-10-18T12:00:00.000Z',
        });
    });

    it('omits the id key for the broadcast event', () => {
        const { data } = toFcmBase(streamerLive(), NOW);

        expect(data).not.toHaveProperty('id');
        expect(Object.keys(data).sort()).toEqual([
            'body',
            'sentAt',
            'title',
            'type',
        ]);
    });

    it('omits an empty id instead of sending undefined or an empty string', () => {
        const { data } = toFcmBase(
            testPushMessage(PushEventType.questEnd, ''),
            NOW,
        );

        expect(data).not.toHaveProperty('id');
    });

    it.each([
        ['travelEnd', travelEnd('c1')],
        ['questEnd', questEnd('q1')],
        ['streamerLive', streamerLive()],
    ])('serializes every %s data value as a string', (_type, message) => {
        const { data } = toFcmBase(message, NOW);

        expect(Object.values(data).every((v) => typeof v === 'string')).toBe(
            true,
        );
    });

    it('sends Android messages with high priority and the TTL in milliseconds', () => {
        expect(toFcmBase(travelEnd('c1'), NOW).android).toEqual({
            priority: 'high',
            ttl: 3_600_000,
        });
        expect(toFcmBase(streamerLive(), NOW).android).toEqual({
            priority: 'high',
            ttl: 900_000,
        });
    });

    it('sends APNs background messages with priority 5 and an absolute expiration', () => {
        expect(toFcmBase(travelEnd('c1'), NOW).apns).toEqual({
            headers: {
                'apns-push-type': 'background',
                'apns-priority': '5',
                'apns-expiration': String(NOW_EPOCH_SECONDS + 3600),
            },
            payload: { aps: { contentAvailable: true } },
        });
        expect(
            toFcmBase(streamerLive(), NOW).apns.headers?.['apns-expiration'],
        ).toBe(String(NOW_EPOCH_SECONDS + 900));
    });

    it('never adds a visible notification block', () => {
        const result = toFcmBase(travelEnd('c1'), NOW);

        expect(result).not.toHaveProperty('notification');
        const aps = result.apns.payload?.aps;
        expect(aps).not.toHaveProperty('alert');
        expect(aps).not.toHaveProperty('sound');
        expect(aps).not.toHaveProperty('badge');
    });
});
