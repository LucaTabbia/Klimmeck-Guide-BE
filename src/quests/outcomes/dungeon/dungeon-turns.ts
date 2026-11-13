import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { isRecord } from '../combat/combat-context';
import type { DungeonStages } from '../outcome-plan';
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

// D-21: lastTurn è 1-based; un successo parziale (soccorso fermo al turno salvato) chiude sul turno turnsCompleted − 1
export function turnCountersOf(
    resolution: Pick<
        DungeonResolution,
        'verdict' | 'turnsTotal' | 'turnsCompleted' | 'failedTurn'
    >,
): TurnCounters {
    const { turnsTotal, failedTurn } = resolution;
    if (resolution.verdict === 'failure' && failedTurn) {
        return {
            turnsTotal,
            turnsCompleted: failedTurn.index,
            lastTurn: failedTurn.index + 1,
            lastTurnKind: failedTurn.kind,
        };
    }
    return {
        turnsTotal,
        turnsCompleted: resolution.turnsCompleted,
        lastTurn: resolution.turnsCompleted,
        lastTurnKind: turnKindOf(resolution.turnsCompleted - 1),
    };
}

// D-12, D-20: il turno da salvare sull'aid, letto dai contatori della battaglia; la sconfitta la dice l'aid, non questa funzione
export function rescueTurnFromStages(
    stages: DungeonStages | null | undefined,
): RescueTurn | null {
    if (!stages || stages.turnsCompleted === null) return null;
    const { lastTurn, lastTurnKind, turnsTotal } = stages;
    if (lastTurn === null || lastTurnKind === null || turnsTotal === null)
        return null;
    // stessa sanificazione della rilettura: mai un turno incoerente a DB (T-21-48)
    return rescueTurnOf({
        index: lastTurn - 1,
        kind: lastTurnKind,
        total: turnsTotal,
    });
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

// D-26: la nuova aid salva il turno dove sono caduti i soccorritori, sul totale della dungeon
export function nextRescueTurnOf(
    resolution: Pick<DungeonResolution, 'failedTurn'>,
    saved: RescueTurn,
): RescueTurn | null {
    const { failedTurn } = resolution;
    if (!failedTurn) return null;
    return {
        index: failedTurn.index,
        kind: failedTurn.kind,
        total: saved.total,
    };
}
