import {
    DUPLICATE_KEY_ERROR_CODE,
    describeMongoError,
    isDuplicateKeyError,
    isDuplicateKeyOn,
} from 'src/mongo/mongo-errors';

const NAME_PATH = 'infos.name';

describe('mongo-errors', () => {
    it('exposes the MongoDB duplicate key error code', () => {
        expect(DUPLICATE_KEY_ERROR_CODE).toBe(11000);
    });

    describe('isDuplicateKeyError', () => {
        it('recognizes an error with the duplicate key code', () => {
            expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
        });

        it.each([
            ['another numeric code', { code: 11001 }],
            ['a string code', { code: '11000' }],
            ['null', null],
            ['undefined', undefined],
            ['a string', 'E11000'],
            ['an error without code', new Error('x')],
        ])('rejects %s', (_label, error) => {
            expect(isDuplicateKeyError(error)).toBe(false);
        });
    });

    describe('isDuplicateKeyOn', () => {
        it('matches the path in keyPattern', () => {
            const error = { code: 11000, keyPattern: { [NAME_PATH]: 1 } };

            expect(isDuplicateKeyOn(error, NAME_PATH)).toBe(true);
        });

        it('matches the path in errorResponse.keyPattern', () => {
            const error = {
                code: 11000,
                errorResponse: { keyPattern: { [NAME_PATH]: 1 } },
            };

            expect(isDuplicateKeyOn(error, NAME_PATH)).toBe(true);
        });

        it('rejects a duplicate on another path', () => {
            const error = { code: 11000, keyPattern: { twitchId: 1 } };

            expect(isDuplicateKeyOn(error, NAME_PATH)).toBe(false);
        });

        it('rejects a duplicate without keyPattern', () => {
            expect(isDuplicateKeyOn({ code: 11000 }, NAME_PATH)).toBe(false);
        });

        it('rejects an error that is not a duplicate key error', () => {
            const error = { code: 112, keyPattern: { [NAME_PATH]: 1 } };

            expect(isDuplicateKeyOn(error, NAME_PATH)).toBe(false);
        });

        it('relies on keyPattern alone when keyValue is present', () => {
            const error = {
                code: 11000,
                keyPattern: { [NAME_PATH]: 1 },
                keyValue: { [NAME_PATH]: 'Aria' },
            };

            expect(isDuplicateKeyOn(error, NAME_PATH)).toBe(true);
        });
    });

    describe('describeMongoError', () => {
        it('names the error and its code', () => {
            const error = Object.assign(new Error('not authorized'), {
                name: 'MongoServerError',
                code: 13,
            });

            expect(describeMongoError(error)).toBe('MongoServerError, code 13');
        });

        it('names an error without code', () => {
            expect(describeMongoError(new Error('x'))).toBe('Error');
        });

        it('describes a non-error value as unknown', () => {
            expect(describeMongoError('boom')).toBe('UnknownError');
        });

        it('keeps the code of a non-error object', () => {
            expect(describeMongoError({ code: 'ECONNRESET' })).toBe(
                'UnknownError, code ECONNRESET',
            );
        });
    });
});
