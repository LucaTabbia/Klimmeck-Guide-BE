import { HttpException, HttpStatus } from '@nestjs/common';

export const IMAGE_REJECTED = 'IMAGE_REJECTED';
export const IMAGE_MODERATION_UNAVAILABLE = 'IMAGE_MODERATION_UNAVAILABLE';

// il corpo porta solo le categorie, mai i punteggi (D-12)
export class ImageRejectedException extends HttpException {
    readonly code = IMAGE_REJECTED;
    readonly extensions = { code: IMAGE_REJECTED };

    constructor(readonly reasons: readonly string[]) {
        super(
            {
                statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                code: IMAGE_REJECTED,
                message: 'Immagine non ammessa',
                reasons: [...reasons],
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
        );
    }
}

export class ImageModerationUnavailableException extends HttpException {
    readonly code = IMAGE_MODERATION_UNAVAILABLE;
    readonly extensions = { code: IMAGE_MODERATION_UNAVAILABLE };

    constructor() {
        super(
            {
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                code: IMAGE_MODERATION_UNAVAILABLE,
                message:
                    'Moderazione delle immagini non disponibile, riprova più tardi',
            },
            HttpStatus.SERVICE_UNAVAILABLE,
        );
    }
}
