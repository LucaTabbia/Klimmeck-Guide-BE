import { isDuplicateDelivery } from 'src/eventsub/duplicate-delivery';

describe('isDuplicateDelivery', () => {
    it.each([
        ['the message id index', { code: 11000, keyPattern: { messageId: 1 } }],
        [
            'the event index',
            { code: 11000, keyPattern: { type: 1, eventId: 1 } },
        ],
        [
            'the message id index reported in errorResponse',
            { code: 11000, errorResponse: { keyPattern: { messageId: 1 } } },
        ],
    ])('treats a duplicate key on %s as a duplicate delivery', (_, error) => {
        expect(isDuplicateDelivery(error)).toBe(true);
    });

    it.each([
        [
            'a duplicate key on another index',
            { code: 11000, keyPattern: { twitchId: 1 } },
        ],
        ['a write conflict', { code: 112 }],
        ['a plain error', new Error('x')],
        ['null', null],
    ])('does not treat %s as a duplicate delivery', (_, error) => {
        expect(isDuplicateDelivery(error)).toBe(false);
    });
});
