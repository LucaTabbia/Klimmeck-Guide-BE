import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    CombatContext,
    CombatResolution,
} from 'src/quests/outcomes/combat/combat-resolver';

export interface RecommendedEntry {
    itemType: ItemReferenceType;
    itemId: string;
    quantity: number;
}

// i consigliati servono alle prove di esplorazione e alle tappe (D-11): la quest li elenca, ogni partecipante porta quelli che possiede
export interface DungeonContext extends CombatContext {
    recommendedLoot: RecommendedEntry[];
    // per characterId, nell'ordine di recommendedLoot
    recommendedOwned: Record<string, RecommendedEntry[]>;
    // ultimo turno da giocare (D-13: il soccorritore si ferma al turno salvato); assente = ultimo turno della dungeon
    lastTurnIndex?: number;
}

export interface FailedTurn {
    index: number;
    kind: DungeonTurnKind;
}

// tappe = scontri, turni = esplorazioni e scontri (D-12, D-21); i totali sono sempre dell'intera dungeon
// contratto (C-WR-02, imposto da checkedDungeonResolution): una sconfitta porta failedTurn entro i turni e non oltre lastTurnIndex,
// del tipo del suo indice, con turnsCompleted uguale all'indice; altrimenti la risoluzione abortisce
export interface DungeonResolution extends CombatResolution {
    stagesCleared: number;
    stagesTotal: number;
    turnsTotal: number;
    turnsCompleted: number;
    failedTurn: FailedTurn | null;
}

// la porta (D-10, D-12, D-13): contesto puro idratato, nessun I/O; l'algoritmo di esplorazione e il motore sono dell'utente e sostituiscono il segnaposto via DI; i turni alternano un'esplorazione e lo scontro con ogni voce di `enemies` nell'ordine della quest, e si può cadere in qualunque turno, anche di esplorazione (`failedTurn`)
export abstract class DungeonResolver {
    abstract explore(
        context: DungeonContext,
        chance: ChanceSource,
    ): DungeonResolution;
}
