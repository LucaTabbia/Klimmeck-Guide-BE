import { HttpStatus } from '@nestjs/common';
import {
    ImageModerationUnavailableException,
    ImageRejectedException,
} from 'src/moderation/image-moderation.exceptions';

describe('image moderation exceptions (D-12, D-14)', () => {
    it('rejects an image with 422 IMAGE_REJECTED and the categories only', () => {
        const exception = new ImageRejectedException(['nudity', 'qr']);

        expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(exception.getResponse()).toEqual({
            statusCode: 422,
            code: 'IMAGE_REJECTED',
            message: 'Immagine non ammessa',
            reasons: ['nudity', 'qr'],
        });
        expect(exception.extensions).toEqual({ code: 'IMAGE_REJECTED' });
        expect(exception.reasons).toEqual(['nudity', 'qr']);
    });

    it('fails closed with 503 IMAGE_MODERATION_UNAVAILABLE', () => {
        const exception = new ImageModerationUnavailableException();

        expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(exception.getResponse()).toEqual({
            statusCode: 503,
            code: 'IMAGE_MODERATION_UNAVAILABLE',
            message:
                'Moderazione delle immagini non disponibile, riprova più tardi',
        });
        expect(exception.extensions).toEqual({
            code: 'IMAGE_MODERATION_UNAVAILABLE',
        });
    });
});
