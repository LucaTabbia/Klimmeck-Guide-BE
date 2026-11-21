import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    additionFor,
    additionTextOf,
    BACKGROUND_ADDITION_MAX_FORM_LENGTH,
    BACKGROUND_ADDITION_MAX_GRAPHEMES,
    mergedAdditions,
} from 'src/quests/guided/background-additions';

const HERO = new Types.ObjectId('64b000000000000000000001');
const MAGE = new Types.ObjectId('64b000000000000000000002');
const THIEF = new Types.ObjectId('64b000000000000000000003');
const COMBINING_ACUTE = '́';
const AT_THE_LIMIT = 'a'.repeat(BACKGROUND_ADDITION_MAX_GRAPHEMES);
const OVER_THE_LIMIT = `${AT_THE_LIMIT}a`;

function codeOf(action: () => unknown): GameRuleErrorCode | null {
    try {
        action();
    } catch (error) {
        if (error instanceof GameRuleException) return error.code;
        throw error;
    }
    return null;
}

describe('additionTextOf', () => {
    it('trims the text of an addition (D-07)', () => {
        expect(additionTextOf('  \n Ha salvato il villaggio.\n ')).toBe(
            'Ha salvato il villaggio.',
        );
    });

    it.each([[''], ['   '], ['\n\t \n'], [null], [undefined], [42]])(
        'reads an empty or blank text as no addition (D-06): %p',
        (raw) => {
            expect(additionTextOf(raw)).toBeNull();
        },
    );

    it('accepts an addition of exactly 1000 graphemes after the trim (D-07)', () => {
        expect(additionTextOf(`  ${AT_THE_LIMIT}\n`)).toBe(AT_THE_LIMIT);
    });

    it('refuses an addition of 1001 graphemes with its own code (D-07)', () => {
        expect(codeOf(() => additionTextOf(OVER_THE_LIMIT))).toBe(
            GameRuleErrorCode.BACKGROUND_ADDITION_TOO_LONG,
        );
    });

    it('refuses a cluster of combining marks over the code unit cap (D-07)', () => {
        const cluster = `a${COMBINING_ACUTE.repeat(BACKGROUND_ADDITION_MAX_FORM_LENGTH)}`;

        expect(codeOf(() => additionTextOf(cluster))).toBe(
            GameRuleErrorCode.BACKGROUND_ADDITION_TOO_LONG,
        );
    });
});

describe('mergedAdditions', () => {
    it('keeps one entry per character with a non-empty text (D-06)', () => {
        expect(
            mergedAdditions(
                [],
                [
                    { character: MAGE, text: '  Ha letto il grimorio. ' },
                    { character: HERO, text: '   ' },
                    { character: THIEF, text: 'Ha aperto la cripta.' },
                ],
            ),
        ).toEqual([
            { character: MAGE, text: 'Ha letto il grimorio.' },
            { character: THIEF, text: 'Ha aperto la cripta.' },
        ]);
    });

    it('accepts a section where every text is empty (D-06)', () => {
        expect(
            mergedAdditions(
                [],
                [
                    { character: HERO, text: '' },
                    { character: MAGE, text: '  \n ' },
                ],
            ),
        ).toEqual([]);
    });

    it('replaces only the addition of the character sent and keeps the others (D-06)', () => {
        expect(
            mergedAdditions(
                [
                    { character: HERO, text: 'Ha vinto.' },
                    { character: MAGE, text: 'Ha letto il grimorio.' },
                ],
                [
                    {
                        character: new Types.ObjectId(MAGE.toHexString()),
                        text: ' Ha bruciato il grimorio. ',
                    },
                ],
            ),
        ).toEqual([
            { character: HERO, text: 'Ha vinto.' },
            { character: MAGE, text: 'Ha bruciato il grimorio.' },
        ]);
    });

    it('appends the addition of a character without a saved one (D-06)', () => {
        expect(
            mergedAdditions(
                [{ character: HERO, text: 'Ha vinto.' }],
                [{ character: THIEF, text: 'Ha aperto la cripta.' }],
            ),
        ).toEqual([
            { character: HERO, text: 'Ha vinto.' },
            { character: THIEF, text: 'Ha aperto la cripta.' },
        ]);
    });

    it.each([
        ['empty', ''],
        ['blank', '  \n\t '],
    ])(
        'deletes only the saved addition of a character whose text comes back %s (D-06)',
        (_name, text) => {
            expect(
                mergedAdditions(
                    [
                        { character: HERO, text: 'Ha vinto.' },
                        { character: MAGE, text: 'Ha letto il grimorio.' },
                    ],
                    [{ character: HERO, text }],
                ),
            ).toEqual([{ character: MAGE, text: 'Ha letto il grimorio.' }]);
        },
    );

    it('leaves the saved additions untouched when nothing is sent (D-06)', () => {
        const saved = [
            { character: HERO, text: 'Ha vinto.' },
            { character: MAGE, text: 'Ha letto il grimorio.' },
        ];

        expect(mergedAdditions(saved, [])).toEqual(saved);
    });

    it('refuses the same character twice in one section (D-06)', () => {
        expect(
            codeOf(() =>
                mergedAdditions(
                    [],
                    [
                        { character: HERO, text: 'Ha vinto.' },
                        {
                            character: new Types.ObjectId(HERO.toHexString()),
                            text: '',
                        },
                    ],
                ),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
    });

    it('refuses the same character twice before reading the texts (D-06)', () => {
        expect(
            codeOf(() =>
                mergedAdditions(
                    [],
                    [
                        { character: HERO, text: OVER_THE_LIMIT },
                        { character: HERO, text: 'Ha vinto.' },
                    ],
                ),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
    });

    it('refuses a section with a text over the limit (D-07)', () => {
        expect(
            codeOf(() =>
                mergedAdditions(
                    [{ character: HERO, text: 'Ha vinto.' }],
                    [
                        { character: HERO, text: 'Ha vinto ancora.' },
                        { character: MAGE, text: OVER_THE_LIMIT },
                    ],
                ),
            ),
        ).toBe(GameRuleErrorCode.BACKGROUND_ADDITION_TOO_LONG);
    });
});

describe('additionFor', () => {
    const additions = [
        { character: HERO, text: 'Ha vinto.' },
        { character: MAGE, text: 'Ha letto il grimorio.' },
    ];

    it('finds the addition of a character in the draft (D-05)', () => {
        expect(
            additionFor(additions, new Types.ObjectId(MAGE.toHexString())),
        ).toBe('Ha letto il grimorio.');
        expect(additionFor(additions, THIEF)).toBeNull();
    });

    it.each([[undefined], [null]])(
        'finds no addition in a draft without the section (D-05): %p',
        (missing) => {
            expect(additionFor(missing, HERO)).toBeNull();
        },
    );

    it('validates again the addition read from the draft (D-07)', () => {
        expect(
            codeOf(() =>
                additionFor([{ character: HERO, text: OVER_THE_LIMIT }], HERO),
            ),
        ).toBe(GameRuleErrorCode.BACKGROUND_ADDITION_TOO_LONG);
    });
});
