import type { PopulateOptions } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import { Spell } from 'src/models/spell.model';
import { isResolvedItemEntry } from 'src/quests/quest-catalog.populate';

// ref che il foglio esiti seleziona (D-19, FE COMBAT-02..05): orfani tollerati come nel catalogo (Phase 8 D-31)
export const QUEST_RESULT_POPULATE: PopulateOptions[] = [
    { path: 'consumablesUsed.item' },
    { path: 'rewards.items.item' },
    { path: 'spellsUsed.spell', model: Spell.name },
    { path: 'spellLearned', model: Spell.name },
    { path: 'enemy', model: Enemy.name },
];

interface ResultItemEntry {
    item?: unknown;
}

export interface ResultRefsHolder {
    consumablesUsed?: ResultItemEntry[] | null;
    rewards?: { items?: ResultItemEntry[] | null } | null;
}

// AssetQuantity.item è ItemUnion!: una voce orfana annullerebbe l'intero risultato sul filo
export function dropOrphanResultRefs(result: ResultRefsHolder): void {
    if (result.consumablesUsed) {
        result.consumablesUsed =
            result.consumablesUsed.filter(isResolvedItemEntry);
    }
    if (result.rewards?.items) {
        result.rewards.items = result.rewards.items.filter(isResolvedItemEntry);
    }
}
