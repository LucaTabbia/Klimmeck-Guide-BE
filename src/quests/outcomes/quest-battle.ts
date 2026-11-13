import type { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import type { ChanceSource } from './chance-source';
import type { CombatContext, CombatResolver } from './combat/combat-resolver';
import {
    battleOf,
    type CombatantBattle,
    dungeonBattleOf,
} from './combatant-plan';
import { buildDungeonContext } from './dungeon/dungeon-context';
import type { DungeonResolver } from './dungeon/dungeon-resolver';
import {
    checkedDungeonResolution,
    dungeonTurnsOf,
    facedEnemiesOf,
    type RescueTurn,
    rescueTurnOf,
    savedTurnOf,
} from './dungeon/dungeon-turns';
import type {
    ResolutionCatalog,
    ResolutionCharacter,
    ResolutionQuest,
} from './resolution-loader.service';

// battaglia per characterId e turno della caduta da salvare sulla nuova aid (D-12, D-26)
export interface QuestBattle {
    battleOf(characterId: Types.ObjectId): CombatantBattle | null;
    fallenTurn: RescueTurn | null;
}

export interface QuestBattleInput {
    quest: ResolutionQuest;
    combatContext: CombatContext | null;
    participants: readonly ResolutionCharacter[];
    combat: CombatResolver;
    dungeon: DungeonResolver;
    chance: ChanceSource;
}

const NO_BATTLE: QuestBattle = { battleOf: () => null, fallenTurn: null };

// unica regola della battaglia per ogni percorso (D-12, D-13, D-20): la dungeon e l'aid col turno salvato passano dalla porta,
// l'aid fino al turno salvato compreso; le altre combattono una volta
export function questBattleOf({
    quest,
    combatContext,
    participants,
    combat,
    dungeon,
    chance,
}: QuestBattleInput): QuestBattle {
    if (!combatContext) return NO_BATTLE;
    const saved = rescueTurnOf(quest.rescue?.turn);
    if (!saved && quest.infos.type !== QuestType.dungeon) {
        const resolution = combat.resolve(combatContext, chance);
        return {
            battleOf: (id) => battleOf(resolution, id),
            fallenTurn: null,
        };
    }
    const resolution = checkedDungeonResolution(
        dungeon.explore(
            {
                ...buildDungeonContext({
                    combat: combatContext,
                    recommendedLoot: quest.requirements?.recommendedLoot,
                    participants,
                }),
                ...(saved ? { lastTurnIndex: saved.index } : {}),
            },
            chance,
        ),
        saved?.index,
    );
    return {
        battleOf: (id) => dungeonBattleOf(resolution, id),
        fallenTurn: savedTurnOf(
            resolution,
            saved?.total ?? resolution.turnsTotal,
        ),
    };
}

// C-IN-02: un turno salvato che l'aid non può percorrere come la dungeon, detto con soli id e conteggi; null se assente o coerente
export function savedTurnWarningOf(
    quest: Pick<ResolutionQuest, '_id' | 'rescue'>,
    enemyCount: number,
): string | null {
    const raw = quest.rescue?.turn;
    if (raw == null) return null;
    const hex = quest._id.toHexString();
    const saved = rescueTurnOf(raw);
    if (!saved)
        return `Soccorso ${hex}: turno salvato non valido, combattimento unico contro tutti i gruppi`;
    const turnsTotal = dungeonTurnsOf(enemyCount).length;
    if (saved.total === turnsTotal) return null;
    return `Soccorso ${hex}: turno salvato su ${saved.total} turni, i gruppi dell'aid ne contano ${turnsTotal}`;
}

// xp e conoscenze dei soli gruppi affrontati fino al turno salvato (D-12)
export function facedCatalogOf(
    catalog: ResolutionCatalog,
    quest: Pick<ResolutionQuest, 'rescue'>,
): ResolutionCatalog {
    const faced = facedEnemiesOf(catalog.enemies, quest.rescue?.turn);
    return faced ? { ...catalog, enemies: faced } : catalog;
}
