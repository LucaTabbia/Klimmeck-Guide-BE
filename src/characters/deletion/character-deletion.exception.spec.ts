import { NotFoundException } from '@nestjs/common';
import { CharacterDeletionErrorCode } from 'src/characters/deletion/character-deletion-error-code.enum';
import { CharacterDeletionException } from 'src/characters/deletion/character-deletion.exception';

describe('CharacterDeletionException', () => {
    it('notFound() is a 404 NotFoundException carrying the error code', () => {
        const message = 'Non hai un personaggio da eliminare';
        const exception = CharacterDeletionException.notFound();

        expect(exception).toBeInstanceOf(NotFoundException);
        expect(exception.getStatus()).toBe(404);
        expect(exception.code).toBe('CHARACTER_NOT_FOUND');
        expect(exception.extensions).toEqual({ code: 'CHARACTER_NOT_FOUND' });
        expect(exception.message).toBe(message);
        expect(exception.getResponse()).toEqual({
            statusCode: 404,
            error: 'Not Found',
            message,
            code: 'CHARACTER_NOT_FOUND',
        });
    });

    it('uses error codes whose values equal their names', () => {
        expect(Object.entries(CharacterDeletionErrorCode)).toEqual([
            ['CHARACTER_NOT_FOUND', 'CHARACTER_NOT_FOUND'],
        ]);
    });
});
