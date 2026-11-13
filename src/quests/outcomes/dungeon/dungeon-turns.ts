import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { isRecord } from '../combat/combat-context';
import { DungeonResolution } from './dungeon-resolver';

const TURNS_PER_ENEMY = 2;

export interface DungeonTurn {
    index: number;
    kind: DungeonTurnKind;
    enemyIndex: number;
}

// turno salvato sull'aid alla sconfitta (D-12): indice 0-based e totale dell'intera dungeon
export interface RescueTurn {
    index: number;
    kind: DungeonTurnKind;
    total: number;
}

export interface TurnCounters {
    turnsTotal: number;
    turnsCompleted: number;
    lastTurn: number;
    lastTurnKind: DungeonTurnKind;
}

const turnKindOf = (index: number): DungeonTurnKind =>
    index % TURNS_PER_ENEMY === 1
        ? DungeonTurnKind.fight
        : DungeonTurnKind.exploration;

// D-12, D-29: per ogni voce di `enemies` un'esplorazione e poi lo scontro con quella voce
export function dungeonTurnsOf(enemyCount: number): DungeonTurn[] {
    return Array.from(
        { length: Math.max(0, enemyCount) * TURNS_PER_ENEMY },
        (_, index) => ({
            index,
            kind: turnKindOf(index),
            enemyIndex: Math.floor(index / TURNS_PER_ENEMY),
        }),
    );
}

const isTurnKind = (value: unknown): value is DungeonTurnKind =>
    Object.values<unknown>(DungeonTurnKind).includes(value);

// T-21-25: il turno salvato si rilegge sanificato, un valore ritoccato a mano diventa null
export function rescueTurnOf(value: unknown): RescueTurn | null {
    if (!isRecord(value)) return null;
    const { index, kind, total } = value;
    if (!Number.isInteger(total) || !Number.isInteger(index)) return null;
    const turnsTotal = total as number;
    const turnIndex = index as number;
    if (turnsTotal <= 0 || turnsTotal % TURNS_PER_ENEMY !== 0) return null;
    if (turnIndex < 0 || turnIndex >= turnsTotal) return null;
    if (!isTurnKind(kind) || kind !== turnKindOf(turnIndex)) return null;
    return { index: turnIndex, kind, total: turnsTotal };
}

export class DungeonContractViolation extends Error {
    constructor(reason: string) {
        super(`Dungeon resolution breaks the port contract: ${reason}`);
        this.name = DungeonContractViolation.name;
    }
}

// C-WR-02, D-13: il contratto della porta, imposto dove si legge la risoluzione; una sconfitta incoerente abortisce la transazione
export function checkedDungeonResolution(
    resolution: DungeonResolution,
    lastTurnIndex?: number,
): DungeonResolution {
    if (resolution.verdict !== 'failure') return resolution;
    const { failedTurn, turnsTotal, turnsCompleted } = resolution;
    if (!failedTurn)
        throw new DungeonContractViolation('failure without failedTurn');
    const { index, kind } = failedTurn;
    if (!Number.isInteger(index) || index < 0 || index >= turnsTotal)
        throw new DungeonContractViolation('failedTurn outside the turns');
    if (lastTurnIndex !== undefined && index > lastTurnIndex)
        throw new DungeonContractViolation('failedTurn past the last turn');
    if (kind !== turnKindOf(index))
        throw new DungeonContractViolation('failedTurn of the wrong kind');
    if (turnsCompleted !== index)
        throw new DungeonContractViolation('turnsCompleted is not failedTurn');
    return resolution;
}

// D-21: lastTurn è 1-based; un successo parziale (soccorso fermo al turno salvato) chiude sull'ultimo turno completato
export function turnCountersOf(
    resolution: Pick<
        DungeonResolution,
        'verdict' | 'turnsTotal' | 'turnsCompleted' | 'failedTurn'
    >,
): TurnCounters {
    const { turnsTotal, failedTurn } = resolution;
    if (resolution.verdict === 'failure' && failedTurn) {
        return fallenCountersOf({ ...failedTurn, total: turnsTotal });
    }
    return {
        turnsTotal,
        turnsCompleted: resolution.turnsCompleted,
        lastTurn: resolution.turnsCompleted,
        lastTurnKind: turnKindOf(resolution.turnsCompleted - 1),
    };
}

// D-12: gli scontri giocati fino al turno salvato compreso (uno ogni esplorazione + scontro)
export function facedEnemyCountOf(turn: RescueTurn): number {
    return Math.floor((turn.index + 1) / TURNS_PER_ENEMY);
}

// D-21: il ferito di un'aid di dungeon è caduto sul turno salvato
export function fallenCountersOf(turn: RescueTurn): TurnCounters {
    return {
        turnsTotal: turn.total,
        turnsCompleted: turn.index,
        lastTurn: turn.index + 1,
        lastTurnKind: turn.kind,
    };
}

// D-12, D-26: unico turno da salvare sulla nuova aid, dal turno della caduta e sul totale della dungeon; sanificato come la rilettura
export function savedTurnOf(
    resolution: Pick<DungeonResolution, 'verdict' | 'failedTurn'>,
    total: number,
): RescueTurn | null {
    const { failedTurn } = resolution;
    if (resolution.verdict !== 'failure' || !failedTurn) return null;
    return rescueTurnOf({
        index: failedTurn.index,
        kind: failedTurn.kind,
        total,
    });
}
