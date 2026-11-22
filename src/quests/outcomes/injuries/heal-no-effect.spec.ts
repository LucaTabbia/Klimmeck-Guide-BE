import { healHasNoEffect } from 'src/quests/outcomes/injuries/heal-no-effect';

const VILLAGE = { lifePointsShare: 0.5, canHeal: ['deepCut'] };

const subject = (
    hp: number,
    injuries: unknown[],
    max = 1000,
    innkeeperInjuries: readonly unknown[] | null | undefined = undefined,
) => ({
    currentLifePoints: hp,
    maxLifePoints: max,
    injuries,
    innkeeperInjuries,
});

const woundedByInnkeeper = (
    hp: number,
    injuries: unknown[],
    innkeeperInjuries: readonly unknown[] | null | undefined,
) => subject(hp, injuries, 1000, innkeeperInjuries);

describe('healHasNoEffect', () => {
    it.each([
        [false, 400, []],
        [true, 500, []],
        [true, 700, []],
        [false, 700, ['deepCut']],
        [true, 700, ['infection']],
        [false, 400, ['infection']],
        [false, 400, ['deepCut']],
    ])(
        'answers %p with %i life points and the injuries %p for a village heal (D-25)',
        (expected, hp, injuries) => {
            expect(healHasNoEffect(subject(hp, injuries), VILLAGE)).toBe(
                expected,
            );
        },
    );

    it.each([undefined, null, 'full', []])(
        'has no effect for anyone with the cure %p (D-25)',
        (cure) => {
            expect(
                healHasNoEffect(subject(1, ['deepCut', 'infection']), cure),
            ).toBe(true);
        },
    );

    it('has no effect with a share of 0 unless an injury is curable (D-25)', () => {
        const cure = { lifePointsShare: 0, canHeal: ['deepCut'] };

        expect(healHasNoEffect(subject(1, []), cure)).toBe(true);
        expect(healHasNoEffect(subject(1, ['deepCut']), cure)).toBe(false);
    });

    it('reads a share outside the scale as 0, like the cure does (D-25)', () => {
        const cure = { lifePointsShare: 50, canHeal: ['deepCut'] };

        expect(healHasNoEffect(subject(1, ['infection']), cure)).toBe(true);
    });

    it('rounds the ceiling like the cure does (D-25)', () => {
        expect(healHasNoEffect(subject(499, [], 999), VILLAGE)).toBe(false);
        expect(healHasNoEffect(subject(500, [], 999), VILLAGE)).toBe(true);
    });

    it('ignores unknown injuries of the character and of canHeal (D-25)', () => {
        const cure = { lifePointsShare: 0.5, canHeal: ['oldWound', 'deepCut'] };

        expect(healHasNoEffect(subject(700, ['oldWound']), cure)).toBe(true);
    });

    describe('innkeeper wounds (Phase 25)', () => {
        const TEMPLE = {
            lifePointsShare: 1,
            canHeal: ['deepCut', 'infection'],
        };

        it('has no effect when the cure matches only innkeeper wounds (D-14)', () => {
            const character = woundedByInnkeeper(
                1000,
                ['infection'],
                ['infection'],
            );

            expect(healHasNoEffect(character, TEMPLE)).toBe(true);
        });

        it('has an effect when an ordinary wound is curable beside an innkeeper one (D-14)', () => {
            const character = woundedByInnkeeper(
                1000,
                ['deepCut', 'infection'],
                ['infection'],
            );

            expect(healHasNoEffect(character, TEMPLE)).toBe(false);
        });

        it('has an effect below the life ceiling whatever the wounds (D-14)', () => {
            const character = woundedByInnkeeper(
                999,
                ['infection'],
                ['infection'],
            );

            expect(healHasNoEffect(character, TEMPLE)).toBe(false);
        });

        it.each([undefined, null])(
            'reads a missing origin (%p) as no innkeeper wound (D-16)',
            (origin) => {
                const character = woundedByInnkeeper(
                    1000,
                    ['infection'],
                    origin,
                );

                expect(healHasNoEffect(character, TEMPLE)).toBe(false);
            },
        );
    });
});
