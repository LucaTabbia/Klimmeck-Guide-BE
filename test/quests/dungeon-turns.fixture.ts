// i quattro contatori dei turni di un foglio (D-21): null fuori da dungeon e aid di dungeon
export const NO_TURNS = {
    turnsTotal: null,
    turnsCompleted: null,
    lastTurn: null,
    lastTurnKind: null,
};

export interface TurnCountersHolder {
    turnsTotal?: unknown;
    turnsCompleted?: unknown;
    lastTurn?: unknown;
    lastTurnKind?: unknown;
}

export const turnsOf = (result: TurnCountersHolder) => ({
    turnsTotal: result.turnsTotal,
    turnsCompleted: result.turnsCompleted,
    lastTurn: result.lastTurn,
    lastTurnKind: result.lastTurnKind,
});
