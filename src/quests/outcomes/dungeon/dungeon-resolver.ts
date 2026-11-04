import { ItemReferenceType } from 'src/models/common/asset-quantity.model';
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
}

export interface DungeonResolution extends CombatResolution {
    stagesCleared: number;
    stagesTotal: number;
}

// la porta (D-10, D-12): contesto puro idratato, nessun I/O; l'algoritmo di esplorazione e il motore sono dell'utente e sostituiscono il segnaposto via DI; le tappe sono le voci di `enemies` nell'ordine della quest
export abstract class DungeonResolver {
    abstract explore(
        context: DungeonContext,
        chance: ChanceSource,
    ): DungeonResolution;
}
