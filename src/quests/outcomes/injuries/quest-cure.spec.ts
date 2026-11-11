import {
    cureOf,
    lifePointsAfterCure,
} from 'src/quests/outcomes/injuries/quest-cure';

describe('cureOf', () => {
    it.each([undefined, null, 'full', 42, true, []])(
        'reads no cure from %p (D-01)',
        (value) => {
            expect(cureOf(value)).toBeNull();
        },
    );

    it('reads a valid cure as it is (D-01)', () => {
        expect(
            cureOf({ lifePointsShare: 0.5, canHeal: ['deepCut', 'sprain'] }),
        ).toEqual({ lifePointsShare: 0.5, canHeal: ['deepCut', 'sprain'] });
    });

    it.each([2, 50, -0.1, NaN, Infinity, '0.5', null, undefined])(
        'reads the share %p as 0, never clamped to 1 (D-23)',
        (value) => {
            expect(
                cureOf({ lifePointsShare: value, canHeal: ['deepCut'] }),
            ).toEqual({ lifePointsShare: 0, canHeal: ['deepCut'] });
        },
    );

    it('keeps the bounds 0 and 1 of the share (D-02)', () => {
        expect(cureOf({ lifePointsShare: 0, canHeal: [] })).toEqual({
            lifePointsShare: 0,
            canHeal: [],
        });
        expect(cureOf({ lifePointsShare: 1, canHeal: [] })).toEqual({
            lifePointsShare: 1,
            canHeal: [],
        });
    });

    it('drops unknown injuries and reads a canHeal that is not a list as empty (D-23)', () => {
        expect(
            cureOf({
                lifePointsShare: 0.5,
                canHeal: ['brokenWing', 'deepCut', 7],
            }),
        ).toEqual({ lifePointsShare: 0.5, canHeal: ['deepCut'] });
        expect(cureOf({ lifePointsShare: 0.5, canHeal: 'deepCut' })).toEqual({
            lifePointsShare: 0.5,
            canHeal: [],
        });
        expect(cureOf({ lifePointsShare: 0.5 })).toEqual({
            lifePointsShare: 0.5,
            canHeal: [],
        });
    });

    it('returns a fresh object without the extra keys of the stored cure (D-23)', () => {
        const stored = {
            lifePointsShare: 0.8,
            canHeal: [],
            extra: 1,
            _id: 'x',
        };

        const cure = cureOf(stored);

        expect(cure).toEqual({ lifePointsShare: 0.8, canHeal: [] });
        expect(Object.keys(cure ?? {}).sort()).toEqual([
            'canHeal',
            'lifePointsShare',
        ]);
        expect(cure).not.toBe(stored);
    });
});

describe('lifePointsAfterCure', () => {
    it.each([
        [400, 1000, 0.5, 500],
        [700, 1000, 0.5, 700],
        [400, 1000, 0, 400],
        [400, 1000, 1, 1000],
        [1000, 1000, 0.5, 1000],
        [400, 1200, 0.5, 600],
        [400, 1200, 1, 1200],
        [333, 999, 0.5, 500],
        [1, 1000, 0, 1],
    ])(
        'brings %i of %i with a share of %d to %i (D-02)',
        (hp, max, share, expected) => {
            expect(lifePointsAfterCure(hp, max, share)).toBe(expected);
        },
    );

    it('never exceeds the maximum nor drops below the current life points (D-02)', () => {
        expect(lifePointsAfterCure(1500, 1000, 0.5)).toBe(1000);
        expect(lifePointsAfterCure(900, 1000, 0.5)).toBe(900);
    });
});
