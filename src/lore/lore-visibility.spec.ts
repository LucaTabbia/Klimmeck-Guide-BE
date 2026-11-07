import { Types } from 'mongoose';
import {
    SEES_EVERYTHING,
    SEES_NOTHING,
    isVisible,
    knowsEnemy,
    visibilityOf,
    visibleRelated,
} from 'src/lore/lore-visibility';

describe('lore visibility', () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const c = new Types.ObjectId();
    const e = new Types.ObjectId();

    it('sees everything as the innkeeper (D-07, D-10)', () => {
        expect(isVisible(SEES_EVERYTHING, new Types.ObjectId())).toBe(true);
        expect(knowsEnemy(SEES_EVERYTHING, e)).toBe(true);
    });

    it('sees nothing without a character (D-10, D-13)', () => {
        expect(visibilityOf(null)).toEqual(SEES_NOTHING);
        expect(visibilityOf(undefined)).toEqual(SEES_NOTHING);
        expect(isVisible(SEES_NOTHING, a)).toBe(false);
        expect(knowsEnemy(SEES_NOTHING, e)).toBe(false);
    });

    it('compares every ref form by hex (D-10)', () => {
        const visibility = visibilityOf({
            unlockedLore: [a, b.toHexString()],
            knownEnemies: [e],
        });

        expect(isVisible(visibility, a)).toBe(true);
        expect(isVisible(visibility, a.toHexString())).toBe(true);
        expect(isVisible(visibility, { _id: b, name: 'x' })).toBe(true);
        expect(isVisible(visibility, c)).toBe(false);
        expect(isVisible(visibility, null)).toBe(false);
        expect(isVisible(visibility, 'non-esadecimale')).toBe(false);
        expect(knowsEnemy(visibility, e)).toBe(true);
        expect(knowsEnemy(visibility, { _id: e })).toBe(true);
        expect(knowsEnemy(visibility, a)).toBe(false);
    });

    it('reads a legacy status without the two sets as nothing known (D-01)', () => {
        const visibility = visibilityOf({});

        expect(visibility).toEqual(SEES_NOTHING);
        expect(isVisible(visibility, a)).toBe(false);
        expect(knowsEnemy(visibility, e)).toBe(false);
    });

    it('keeps only the visible populated related lore (D-10, Pitfall 9)', () => {
        const docA = { _id: a };
        const docC = { _id: c };
        const visibility = visibilityOf({ unlockedLore: [a] });

        expect(visibleRelated(visibility, [docA, docC, a, null])).toEqual([
            docA,
        ]);
        expect(visibleRelated(SEES_EVERYTHING, [docA, docC, a, null])).toEqual([
            docA,
            docC,
        ]);
        expect(visibleRelated(visibility, undefined)).toEqual([]);
    });
});
