import { BadRequestException } from '@nestjs/common';
import { CharacterCreationErrorCode } from 'src/characters/creation/character-creation-error-code.enum';

export class CharacterCreationException extends BadRequestException {
    readonly code: CharacterCreationErrorCode;
    readonly extensions: { code: CharacterCreationErrorCode };

    private constructor(code: CharacterCreationErrorCode, message: string) {
        super({ statusCode: 400, error: 'Bad Request', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions; formatDomainError ripristina il codice dopo la riscrittura di Nest
        this.extensions = { code };
    }

    static nameInvalid(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.CHARACTER_NAME_INVALID,
            'Nome non valido: da 2 a 20 caratteri tra lettere, spazi, apostrofi e trattini, con almeno una lettera',
        );
    }

    static nameTaken(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.CHARACTER_NAME_TAKEN,
            'Nome già in uso',
        );
    }

    static ageOutOfRange(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.CHARACTER_AGE_OUT_OF_RANGE,
            'Età non valida per la razza scelta',
        );
    }

    static alreadyExists(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.CHARACTER_ALREADY_EXISTS,
            'Hai già un personaggio',
        );
    }

    static startingLocationUnavailable(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.STARTING_LOCATION_UNAVAILABLE,
            'Città di partenza non disponibile per la razza scelta',
        );
    }

    static backgroundTooLong(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.BAD_USER_INPUT,
            'La storia del personaggio può contenere al massimo 500 caratteri',
        );
    }

    static imagePathInvalid(): CharacterCreationException {
        return new CharacterCreationException(
            CharacterCreationErrorCode.BAD_USER_INPUT,
            "L'immagine deve essere un URL https valido",
        );
    }
}
