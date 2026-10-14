import { BadRequestException } from '@nestjs/common';
import { CharacterCreationErrorCode } from 'src/characters/creation/character-creation-error-code.enum';
import { CharacterCreationException } from 'src/characters/creation/character-creation.exception';

describe('CharacterCreationException', () => {
    const cases: Array<
        [
            string,
            () => CharacterCreationException,
            CharacterCreationErrorCode,
            string,
        ]
    > = [
        [
            'nameInvalid',
            () => CharacterCreationException.nameInvalid(),
            CharacterCreationErrorCode.CHARACTER_NAME_INVALID,
            'Nome non valido: da 2 a 20 caratteri tra lettere, spazi, apostrofi e trattini, con almeno una lettera',
        ],
        [
            'nameTaken',
            () => CharacterCreationException.nameTaken(),
            CharacterCreationErrorCode.CHARACTER_NAME_TAKEN,
            'Nome già in uso',
        ],
        [
            'ageOutOfRange',
            () => CharacterCreationException.ageOutOfRange(),
            CharacterCreationErrorCode.CHARACTER_AGE_OUT_OF_RANGE,
            'Età non valida per la razza scelta',
        ],
        [
            'alreadyExists',
            () => CharacterCreationException.alreadyExists(),
            CharacterCreationErrorCode.CHARACTER_ALREADY_EXISTS,
            'Hai già un personaggio',
        ],
        [
            'startingLocationUnavailable',
            () => CharacterCreationException.startingLocationUnavailable(),
            CharacterCreationErrorCode.STARTING_LOCATION_UNAVAILABLE,
            'Città di partenza non disponibile per la razza scelta',
        ],
        [
            'backgroundTooLong',
            () => CharacterCreationException.backgroundTooLong(),
            CharacterCreationErrorCode.BAD_USER_INPUT,
            'La storia del personaggio può contenere al massimo 500 caratteri',
        ],
        [
            'imagePathInvalid',
            () => CharacterCreationException.imagePathInvalid(),
            CharacterCreationErrorCode.BAD_USER_INPUT,
            "L'immagine deve essere un URL https valido",
        ],
    ];

    it.each(cases)(
        '%s() is a 400 BadRequestException carrying the error code',
        (_name, factory, code, message) => {
            const exception = factory();

            expect(exception).toBeInstanceOf(BadRequestException);
            expect(exception.getStatus()).toBe(400);
            expect(exception.code).toBe(code);
            expect(exception.extensions).toEqual({ code });
            expect(exception.message).toBe(message);
            expect(exception.getResponse()).toEqual({
                statusCode: 400,
                error: 'Bad Request',
                message,
                code,
            });
        },
    );

    it('uses error codes whose values equal their names', () => {
        expect(Object.entries(CharacterCreationErrorCode)).toEqual([
            ['CHARACTER_NAME_INVALID', 'CHARACTER_NAME_INVALID'],
            ['CHARACTER_NAME_TAKEN', 'CHARACTER_NAME_TAKEN'],
            ['CHARACTER_AGE_OUT_OF_RANGE', 'CHARACTER_AGE_OUT_OF_RANGE'],
            ['CHARACTER_ALREADY_EXISTS', 'CHARACTER_ALREADY_EXISTS'],
            ['STARTING_LOCATION_UNAVAILABLE', 'STARTING_LOCATION_UNAVAILABLE'],
            ['BAD_USER_INPUT', 'BAD_USER_INPUT'],
        ]);
    });
});
