import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    DungeonContext,
    DungeonResolution,
    DungeonResolver,
} from 'src/quests/outcomes/dungeon/dungeon-resolver';
import { dungeonTurnsOf } from 'src/quests/outcomes/dungeon/dungeon-turns';

// porta di test (D-13, D-29): ogni chiamata a explore consuma un indice e cade su quel turno, anche di esplorazione, dopo aver giocato col segnaposto i turni che lo precedono; esauriti gli indici delega al segnaposto
// un indice dato ma assente dai turni, o oltre il turno salvato del soccorritore, è un errore della spec (C-IN-05): mai una dungeon vinta al suo posto
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
        if (index === undefined)
            return this.placeholder.explore(context, chance);
        const turn = dungeonTurnsOf(context.enemies.length)[index];
        if (!turn)
            throw new Error(`Turn ${index} is not a turn of this dungeon`);
        if (
            context.lastTurnIndex !== undefined &&
            index > context.lastTurnIndex
        )
            throw new Error(
                `Turn ${index} is past the last turn ${context.lastTurnIndex}`,
            );
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
