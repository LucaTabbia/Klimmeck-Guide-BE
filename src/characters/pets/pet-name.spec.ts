import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { petNameOf } from './pet-name';

function refusalOf(raw: string): unknown {
    try {
        petNameOf(raw);
    } catch (error) {
        return error;
    }
    return undefined;
}

describe('petNameOf', () => {
    it('accepts the same names as a character name, normalised (D-21, D-31)', () => {
        expect(petNameOf('  Fenrir  ')).toBe('Fenrir');
        expect(petNameOf('Lupo d’Argento')).toBe("Lupo d'Argento");
        expect(petNameOf('Anne-Marie')).toBe('Anne-Marie');
    });

    it.each(['F', 'x'.repeat(21), 'Fenrir1', '!!', '   '])(
        'refuses what a character name refuses with PET_NAME_INVALID (D-31): %p',
        (raw) => {
            const refusal = refusalOf(raw);

            expect(refusal).toBeInstanceOf(GameRuleException);
            expect((refusal as GameRuleException).code).toBe(
                GameRuleErrorCode.PET_NAME_INVALID,
            );
        },
    );

    it('clears the name with null or undefined (D-31)', () => {
        expect(petNameOf(null)).toBeNull();
        expect(petNameOf(undefined)).toBeNull();
    });

    it('applies no word filter beyond the form rules (D-31)', () => {
        expect(petNameOf('Stupido Ladro')).toBe('Stupido Ladro');
    });
});
