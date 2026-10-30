import { HttpException, HttpStatus } from '@nestjs/common';

// senza codice @nestjs/apollo mapperebbe il 429 in INTERNAL_SERVER_ERROR e il sanitizer lo nasconderebbe (C8)
export class TooManyRequestsException extends HttpException {
    readonly code = 'TOO_MANY_REQUESTS' as const;
    readonly extensions = { code: 'TOO_MANY_REQUESTS' as const };

    constructor() {
        super(
            {
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                code: 'TOO_MANY_REQUESTS',
                message: 'Troppe richieste',
            },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }
}
