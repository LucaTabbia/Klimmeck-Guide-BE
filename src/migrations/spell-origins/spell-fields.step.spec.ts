// UNA TANTUM (Phase 24 D-01, D-07): prova la regola pura del passo delle magie — esce dal repo dopo il boot reale
import { SpellOrigin } from 'src/models/enums/spell-origin.enum';
import { spellMigrationOf } from './spell-fields.step';

describe('spellMigrationOf', () => {
    it.each([
        [4_000, 6],
        [12_000, 10],
        [20_000, 12],
        [30_000, 15],
        [50_000, 20],
        [0, 1],
        [3_949, 5],
        [3_950, 6],
    ])(
        'converts the minimum xp of the catalogue to the level of the level table (D-07): %i xp',
        (minXpToLearn, level) => {
            expect(
                spellMigrationOf({ minXpToLearn, origin: SpellOrigin.void }),
            ).toEqual({ set: { minLevelToLearn: level } });
        },
    );

    it('defaults a missing origin to arcane (D-01)', () => {
        expect(spellMigrationOf({ minXpToLearn: 4_000 })).toEqual({
            set: { minLevelToLearn: 6, origin: SpellOrigin.arcane },
        });
    });

    it('sets only the missing fields (D-07)', () => {
        expect(
            spellMigrationOf({ minXpToLearn: 4_000, minLevelToLearn: 3 }),
        ).toEqual({ set: { origin: SpellOrigin.arcane } });
        expect(
            spellMigrationOf({
                minXpToLearn: 12_000,
                origin: SpellOrigin.shamanic,
            }),
        ).toEqual({ set: { minLevelToLearn: 10 } });
    });

    it('treats a null field as missing (D-07)', () => {
        expect(
            spellMigrationOf({
                minXpToLearn: 20_000,
                minLevelToLearn: null,
                origin: null,
            }),
        ).toEqual({
            set: { minLevelToLearn: 12, origin: SpellOrigin.arcane },
        });
    });

    it('leaves a spell with both fields alone, whatever their values (D-07)', () => {
        expect(
            spellMigrationOf({ minLevelToLearn: 4, origin: SpellOrigin.void }),
        ).toBe('alreadyDone');
        expect(
            spellMigrationOf({
                minXpToLearn: 50_000,
                minLevelToLearn: 'quattro',
                origin: 'fire',
            }),
        ).toBe('alreadyDone');
    });

    it.each([[undefined], [null], [-1], [NaN], ['4000'], [Infinity]])(
        'counts as unmatched a spell without a convertible minimum xp (D-07): %p',
        (minXpToLearn) => {
            expect(spellMigrationOf({ minXpToLearn })).toBe('unmatched');
            expect(
                spellMigrationOf({ minXpToLearn, origin: SpellOrigin.void }),
            ).toBe('unmatched');
        },
    );
});
