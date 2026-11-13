import { Types } from 'mongoose';
import {
    describeDungeonOrder,
    strongestEnemyIsLast,
} from './dungeon-order.report';

const SHRUB = new Types.ObjectId();
const RAT = new Types.ObjectId();
const LICH = new Types.ObjectId();
const WRAITH = new Types.ObjectId();
const MISSING = new Types.ObjectId();

const XP_BY_ID: ReadonlyMap<string, number | null> = new Map([
    [SHRUB.toHexString(), 20],
    [RAT.toHexString(), null],
    [LICH.toHexString(), 120],
    [WRAITH.toHexString(), 120],
]);

// utente 2026-11-13: «il nemico più forte sia presente nell'ultimo turno di combattimento (come un boss di un dungeon)»
describe('strongestEnemyIsLast', () => {
    it('holds when the last group is the strongest enemy (quick 261113-aql)', () => {
        expect(strongestEnemyIsLast([SHRUB, RAT, LICH], XP_BY_ID)).toBe(true);
    });

    it('fails when the strongest enemy stands in the middle (quick 261113-aql)', () => {
        expect(strongestEnemyIsLast([SHRUB, LICH, RAT], XP_BY_ID)).toBe(false);
    });

    it('holds on a tie when one of the strongest is last (quick 261113-aql)', () => {
        expect(strongestEnemyIsLast([LICH, SHRUB, WRAITH], XP_BY_ID)).toBe(
            true,
        );
    });

    it('holds for a single group or no group (quick 261113-aql)', () => {
        expect(strongestEnemyIsLast([RAT], XP_BY_ID)).toBe(true);
        expect(strongestEnemyIsLast([], XP_BY_ID)).toBe(true);
    });

    it('reads a null xp as zero (quick 261113-aql)', () => {
        expect(strongestEnemyIsLast([SHRUB, RAT], XP_BY_ID)).toBe(false);
        expect(strongestEnemyIsLast([RAT, SHRUB], XP_BY_ID)).toBe(true);
    });

    it('skips a group missing from the catalog, as the fight does (quick 261113-aql)', () => {
        expect(strongestEnemyIsLast([SHRUB, LICH, MISSING], XP_BY_ID)).toBe(
            true,
        );
        expect(strongestEnemyIsLast([LICH, SHRUB, MISSING], XP_BY_ID)).toBe(
            false,
        );
        expect(strongestEnemyIsLast([SHRUB, MISSING], XP_BY_ID)).toBe(true);
    });
});

describe('describeDungeonOrder', () => {
    it('names only the quest id (quick 261113-aql)', () => {
        const id = new Types.ObjectId();

        expect(describeDungeonOrder(id)).toBe(
            `Ordine della dungeon: missione ${id.toHexString()} senza il nemico più forte all'ultimo gruppo`,
        );
    });
});
