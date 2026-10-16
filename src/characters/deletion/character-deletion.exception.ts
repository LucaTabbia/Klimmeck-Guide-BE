import { NotFoundException } from '@nestjs/common';
import { CharacterDeletionErrorCode } from 'src/characters/deletion/character-deletion-error-code.enum';

export class CharacterDeletionException extends NotFoundException {
    readonly code: CharacterDeletionErrorCode;
    readonly extensions: { code: CharacterDeletionErrorCode };

    private constructor(code: CharacterDeletionErrorCode, message: string) {
        super({ statusCode: 404, error: 'Not Found', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions; formatDomainError ripristina il codice dopo la riscrittura di Nest
        this.extensions = { code };
    }

    static notFound(): CharacterDeletionException {
        return new CharacterDeletionException(
            CharacterDeletionErrorCode.CHARACTER_NOT_FOUND,
            'Non hai un personaggio da eliminare',
        );
    }
}
