import { HttpStatus } from '@nestjs/common';
import { TooManyRequestsException } from 'src/throttling/too-many-requests.exception';

describe('TooManyRequestsException', () => {
    it('codes a throttled call as TOO_MANY_REQUESTS (C8)', () => {
        const exception = new TooManyRequestsException();

        expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(exception.extensions).toEqual({ code: 'TOO_MANY_REQUESTS' });
        expect(exception.getResponse()).toEqual({
            statusCode: 429,
            code: 'TOO_MANY_REQUESTS',
            message: 'Troppe richieste',
        });
    });
});
