import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { dungeonTurnsOf, rescueTurnOf, turnCountersOf } from './dungeon-turns';

const { exploration, fight } = DungeonTurnKind;

describe('dungeonTurnsOf', () => {
    it('alternates exploration and fight for every enemy group (D-12, D-29)', () => {
        const turns = dungeonTurnsOf(4);

        expect(turns.map((turn) => turn.index)).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7,
        ]);
        expect(turns.map((turn) => turn.kind)).toEqual([
            exploration,
            fight,
            exploration,
            fight,
            exploration,
            fight,
            exploration,
            fight,
        ]);
        expect(turns.map((turn) => turn.enemyIndex)).toEqual([
            0, 0, 1, 1, 2, 2, 3, 3,
        ]);
        expect(dungeonTurnsOf(0)).toEqual([]);
    });
});

describe('rescueTurnOf', () => {
    it('reads a valid saved turn and rejects malformed ones (D-12)', () => {
        expect(
            rescueTurnOf({ index: 4, kind: 'exploration', total: 8 }),
        ).toEqual({ index: 4, kind: exploration, total: 8 });
        expect(rescueTurnOf({ index: 3, kind: 'fight', total: 8 })).toEqual({
            index: 3,
            kind: fight,
            total: 8,
        });
        expect(
            [
                undefined,
                null,
                'turn',
                { index: 8, kind: 'exploration', total: 8 },
                { index: -1, kind: 'fight', total: 8 },
                { index: 2.5, kind: 'exploration', total: 8 },
                { index: 0, kind: 'exploration', total: 0 },
                { index: 2, kind: 'exploration', total: 7 },
                { index: 2, kind: 'fight', total: 8 },
                { index: 3, kind: 'exploration', total: 8 },
                { index: 2, kind: 'ambush', total: 8 },
                { index: '2', kind: 'exploration', total: 8 },
            ].map(rescueTurnOf),
        ).toEqual(Array(12).fill(null));
    });
});

describe('turnCountersOf', () => {
    it('counts a cleared dungeon (D-21)', () => {
        expect(
            turnCountersOf({
                verdict: 'success',
                turnsTotal: 8,
                turnsCompleted: 8,
                failedTurn: null,
            }),
        ).toEqual({
            turnsTotal: 8,
            turnsCompleted: 8,
            lastTurn: 8,
            lastTurnKind: fight,
        });
    });

    it('counts a walk that stops on the saved turn (D-21)', () => {
        expect(
            turnCountersOf({
                verdict: 'success',
                turnsTotal: 8,
                turnsCompleted: 5,
                failedTurn: null,
            }),
        ).toEqual({
            turnsTotal: 8,
            turnsCompleted: 5,
            lastTurn: 5,
            lastTurnKind: exploration,
        });
    });

    it('counts a dungeon lost on a turn (D-21)', () => {
        expect(
            turnCountersOf({
                verdict: 'failure',
                turnsTotal: 8,
                turnsCompleted: 4,
                failedTurn: { index: 4, kind: exploration },
            }),
        ).toEqual({
            turnsTotal: 8,
            turnsCompleted: 4,
            lastTurn: 5,
            lastTurnKind: exploration,
        });
        expect(
            turnCountersOf({
                verdict: 'failure',
                turnsTotal: 8,
                turnsCompleted: 3,
                failedTurn: { index: 3, kind: fight },
            }),
        ).toEqual({
            turnsTotal: 8,
            turnsCompleted: 3,
            lastTurn: 4,
            lastTurnKind: fight,
        });
    });
});
