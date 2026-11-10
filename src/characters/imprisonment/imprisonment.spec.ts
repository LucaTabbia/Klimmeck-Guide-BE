import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import {
    CRIME_PRISON_MS,
    imprisonedUntilOf,
    NOT_IMPRISONED_PROJECTION,
    notImprisonedAt,
    prisonReleaseAfter,
    refusalWhileImprisoned,
} from './imprisonment';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const LATER = new Date('2026-11-10T20:00:00.000Z');
const EARLIER = new Date('2026-11-10T08:00:00.000Z');

describe('imprisonment (quick 261110-cgd)', () => {
    it('lasts ten hours from the conclusion of the crime (quick 261110-cgd)', () => {
        expect(CRIME_PRISON_MS).toBe(10 * 60 * 60 * 1000);
        expect(prisonReleaseAfter(NOW)).toEqual(
            new Date('2026-11-10T22:00:00.000Z'),
        );
    });

    it('reads a future release date as imprisoned (quick 261110-cgd)', () => {
        expect(imprisonedUntilOf({ imprisonedUntil: LATER }, NOW)).toEqual(
            LATER,
        );
    });

    it.each([
        ['a past date', { imprisonedUntil: EARLIER }],
        ['the current instant', { imprisonedUntil: NOW }],
        ['null', { imprisonedUntil: null }],
        ['a missing field', {}],
        ['a missing status', null],
        ['a value that is not a date', { imprisonedUntil: 'tomorrow' }],
    ])('reads %s as free (quick 261110-cgd)', (_label, status) => {
        expect(imprisonedUntilOf(status, NOW)).toBeNull();
    });

    it('refuses with CHARACTER_IMPRISONED and the release instant while imprisoned (quick 261110-cgd)', () => {
        const refusal = refusalWhileImprisoned({ imprisonedUntil: LATER }, NOW);

        expect(refusal?.code).toBe(GameRuleErrorCode.CHARACTER_IMPRISONED);
        expect(refusal?.extensions).toEqual({
            code: 'CHARACTER_IMPRISONED',
            imprisonedUntil: LATER.toISOString(),
        });
    });

    it('does not refuse a free character (quick 261110-cgd)', () => {
        expect(
            refusalWhileImprisoned({ imprisonedUntil: EARLIER }, NOW),
        ).toBeNull();
    });

    it('guards a write on a character free at the given instant (quick 261110-cgd)', () => {
        expect(notImprisonedAt(NOW)).toEqual({
            'status.imprisonedUntil': { $not: { $gt: NOW } },
        });
        expect(NOT_IMPRISONED_PROJECTION).toEqual({
            'status.imprisonedUntil': 1,
        });
    });
});
