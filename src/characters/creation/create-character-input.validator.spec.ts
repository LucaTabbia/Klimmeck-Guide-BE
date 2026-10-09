import { CharacterCreationErrorCode } from 'src/characters/creation/character-creation-error-code.enum';
import { CharacterCreationException } from 'src/characters/creation/character-creation.exception';
import { validateCreateCharacterInput } from 'src/characters/creation/create-character-input.validator';
import { listRaceTraits } from 'src/characters/creation/race-traits';
import { ClassType } from 'src/models/enums/class-type.enum';
import { PronounType } from 'src/models/enums/pronoun-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { SexType } from 'src/models/enums/sex-type.enum';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';

const VALID: CreateCharacterInput = {
    name: 'Aria',
    sex: SexType.female,
    pronoun: PronounType.she,
    race: RaceType.human,
    classType: ClassType.wizard,
    age: 25,
    background: 'Nata a Drustea.',
    imagePath: 'https://cdn.test/image.png',
};

const EMOJI_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';

function withoutKey(key: keyof CreateCharacterInput): CreateCharacterInput {
    const input = { ...VALID };
    delete input[key];
    return input;
}

function expectRejection(
    input: CreateCharacterInput,
    code: CharacterCreationErrorCode,
): void {
    let caught: unknown;
    try {
        validateCreateCharacterInput(input);
    } catch (error) {
        caught = error;
    }
    expect(caught).toBeInstanceOf(CharacterCreationException);
    expect((caught as CharacterCreationException).code).toBe(code);
}

describe('validateCreateCharacterInput', () => {
    it('returns the normalized input of a valid character', () => {
        expect(validateCreateCharacterInput(VALID)).toEqual({
            name: 'Aria',
            sex: 'female',
            pronoun: 'she',
            race: 'human',
            classType: 'wizard',
            age: 25,
            background: 'Nata a Drustea.',
            imagePath: 'https://cdn.test/image.png',
        });
    });

    describe('name', () => {
        it.each([
            ['  Aria   di  Luna ', 'Aria di Luna'],
            ['D’Arcy', "D'Arcy"],
        ])('normalizes %p to %p', (name, expected) => {
            expect(validateCreateCharacterInput({ ...VALID, name }).name).toBe(
                expected,
            );
        });

        it.each(['A', 'Aria2', '--'])('rejects %p', (name) => {
            expectRejection(
                { ...VALID, name },
                CharacterCreationErrorCode.CHARACTER_NAME_INVALID,
            );
        });

        it('is checked before the age', () => {
            expectRejection(
                { ...VALID, name: 'A', age: -1 },
                CharacterCreationErrorCode.CHARACTER_NAME_INVALID,
            );
        });
    });

    describe('age', () => {
        it.each(listRaceTraits())(
            'accepts only the inclusive $race range',
            ({ race, minAge, maxAge }) => {
                expect(
                    validateCreateCharacterInput({
                        ...VALID,
                        race,
                        age: minAge,
                    }).age,
                ).toBe(minAge);
                expect(
                    validateCreateCharacterInput({
                        ...VALID,
                        race,
                        age: maxAge,
                    }).age,
                ).toBe(maxAge);
                expectRejection(
                    { ...VALID, race, age: minAge - 1 },
                    CharacterCreationErrorCode.CHARACTER_AGE_OUT_OF_RANGE,
                );
                expectRejection(
                    { ...VALID, race, age: maxAge + 1 },
                    CharacterCreationErrorCode.CHARACTER_AGE_OUT_OF_RANGE,
                );
            },
        );
    });

    describe('background', () => {
        it.each([
            ['an absent key', withoutKey('background')],
            ['null', { ...VALID, background: null }],
            ['blank', { ...VALID, background: '   ' }],
        ])('is empty when %s', (_label, input) => {
            expect(validateCreateCharacterInput(input).background).toBe('');
        });

        it('is trimmed', () => {
            expect(
                validateCreateCharacterInput({
                    ...VALID,
                    background: '  Storia  ',
                }).background,
            ).toBe('Storia');
        });

        it('accepts 500 characters and rejects 501', () => {
            const background = 'a'.repeat(500);

            expect(
                validateCreateCharacterInput({ ...VALID, background })
                    .background,
            ).toBe(background);
            expectRejection(
                { ...VALID, background: 'a'.repeat(501) },
                CharacterCreationErrorCode.BAD_USER_INPUT,
            );
        });

        it('counts visible characters rather than UTF-16 units', () => {
            const background = EMOJI_FAMILY.repeat(500);

            expect(background).toHaveLength(4000);
            expect(
                validateCreateCharacterInput({ ...VALID, background })
                    .background,
            ).toBe(background);
        });

        it('rejects a single visible character made of thousands of combining marks', () => {
            expectRejection(
                { ...VALID, background: 'a' + '́'.repeat(5000) },
                CharacterCreationErrorCode.BAD_USER_INPUT,
            );
        });
    });

    describe('imagePath', () => {
        it.each([
            ['an absent key', withoutKey('imagePath')],
            ['null', { ...VALID, imagePath: null }],
            ['empty', { ...VALID, imagePath: '' }],
            ['blank', { ...VALID, imagePath: '   ' }],
        ])('is null when %s', (_label, input) => {
            expect(validateCreateCharacterInput(input).imagePath).toBeNull();
        });

        it('keeps a Cloudinary secure URL unchanged', () => {
            const imagePath =
                'https://res.cloudinary.com/demo/image/upload/v1/characters_profile/x.png';

            expect(
                validateCreateCharacterInput({ ...VALID, imagePath }).imagePath,
            ).toBe(imagePath);
        });

        it.each([
            'http://cdn.test/image.png',
            'not a url',
            'javascript:alert(1)',
            'ftp://cdn.test/x.png',
            'https://cdn.test/' + 'a'.repeat(2048),
        ])('rejects %p', (imagePath) => {
            expectRejection(
                { ...VALID, imagePath },
                CharacterCreationErrorCode.BAD_USER_INPUT,
            );
        });
    });

    it('returns only the character fields, ignoring any injected key', () => {
        const result = validateCreateCharacterInput({
            ...VALID,
            userId: 'x',
            status: { level: 99 },
        } as unknown as CreateCharacterInput);

        expect(Object.keys(result).sort()).toEqual([
            'age',
            'background',
            'classType',
            'imagePath',
            'name',
            'pronoun',
            'race',
            'sex',
        ]);
    });
});
