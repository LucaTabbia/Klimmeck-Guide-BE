import { Types } from 'mongoose';
import { loreBackfillOf, wonEnemyIdsOf } from './lore-backfill';

describe('lore backfill', () => {
    const [a, b, c] = [1, 2, 3].map(() => new Types.ObjectId());
    const [g1, g2, p1] = [1, 2, 3].map(() => new Types.ObjectId());

    function planFor(status: Parameters<typeof loreBackfillOf>[0]['status']) {
        return loreBackfillOf({
            status,
            geography: [g1, g2],
            enemyIds: [a],
            enemyLore: new Map([[a.toHexString(), [p1]]]),
        });
    }

    it('collects the enemies of the won results in both forms (D-11)', () => {
        expect(
            wonEnemyIdsOf([
                { enemies: [{ enemy: a }, { enemy: b }] },
                { enemy: c.toHexString() },
                { enemies: [{ enemy: a }] },
                { enemies: null },
            ]),
        ).toEqual([a, b, c]);
    });

    it('adds the position geography and the won enemies with their lore (D-11)', () => {
        expect(planFor({ unlockedLore: [], knownEnemies: [] })).toEqual({
            loreIds: [g1, g2, p1],
            enemyIds: [a],
        });
    });

    it('adds only what the character does not know yet (D-11)', () => {
        expect(planFor({ unlockedLore: [g1], knownEnemies: [a] })).toEqual({
            loreIds: [g2, p1],
            enemyIds: [],
        });
    });

    it('adds nothing a second time (D-11)', () => {
        expect(
            planFor({
                unlockedLore: [g1, g2.toHexString(), p1],
                knownEnemies: [a],
            }),
        ).toEqual({ loreIds: [], enemyIds: [] });
    });

    it('reads a legacy status without the two sets (D-11)', () => {
        const fresh = { loreIds: [g1, g2, p1], enemyIds: [a] };
        expect(planFor({ location: new Types.ObjectId() })).toEqual(fresh);
        expect(planFor(null)).toEqual(fresh);
        expect(planFor(undefined)).toEqual(fresh);
    });
});
