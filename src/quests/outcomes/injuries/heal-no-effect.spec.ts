import { healHasNoEffect } from 'src/quests/outcomes/injuries/heal-no-effect';

const VILLAGE = { lifePointsShare: 0.5, canHeal: ['deepCut'] };

const subject = (hp: number, injuries: unknown[], max = 1000) => ({
    currentLifePoints: hp,
    maxLifePoints: max,
    injuries,
});

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
});
