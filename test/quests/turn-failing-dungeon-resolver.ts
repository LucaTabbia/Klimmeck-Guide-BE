import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    DungeonContext,
    DungeonResolution,
    DungeonResolver,
} from 'src/quests/outcomes/dungeon/dungeon-resolver';
import { dungeonTurnsOf } from 'src/quests/outcomes/dungeon/dungeon-turns';

// porta di test (D-13, D-29): ogni chiamata a explore consuma un indice e cade su quel turno, anche di esplorazione, dopo aver giocato col segnaposto i turni che lo precedono; esauriti gli indici delega al segnaposto
export class TurnFailingDungeonResolver extends DungeonResolver {
    private readonly failingTurns: number[];

    constructor(
        private readonly placeholder: DungeonResolver,
        failingTurns: readonly number[],
    ) {
        super();
        this.failingTurns = [...failingTurns];
    }

    explore(context: DungeonContext, chance: ChanceSource): DungeonResolution {
        const index = this.failingTurns.shift();
        const turn =
            index === undefined
                ? undefined
                : dungeonTurnsOf(context.enemies.length)[index];
        if (!turn) return this.placeholder.explore(context, chance);
        const played = this.placeholder.explore(
            { ...context, lastTurnIndex: turn.index - 1 },
            chance,
        );
        if (played.verdict === 'failure') return played;
        return {
            ...played,
            verdict: 'failure',
            turnsCompleted: turn.index,
            failedTurn: { index: turn.index, kind: turn.kind },
        };
    }
}
