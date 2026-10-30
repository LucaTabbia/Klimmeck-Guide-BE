import { REQUEST_ID_HEADER, requestIdFrom } from 'src/graphql/request-id';

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

describe('requestIdFrom', () => {
    it('reads the x-request-id header', () => {
        expect(REQUEST_ID_HEADER).toBe('x-request-id');
    });

    it('reuses a well-formed x-request-id (D-07)', () => {
        expect(requestIdFrom('abc-123_X.y')).toBe('abc-123_X.y');
    });

    it.each(['', 'a b', 'x'.repeat(65), 'a\nb', ['a', 'b'], undefined])(
        'generates a fresh id for an unusable header: %p (D-07)',
        (header) => {
            expect(requestIdFrom(header)).toMatch(UUID_PATTERN);
        },
    );

    it('generates a different id on every call without a header (D-07)', () => {
        expect(requestIdFrom(undefined)).not.toBe(requestIdFrom(undefined));
    });
});
