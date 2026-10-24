import type { PopulateOptions } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import type { QuestResult } from 'src/models/quest-result/quest-result.model';
import { Spell } from 'src/models/spell.model';
import type { QuestResultDraft } from 'src/quests/outcomes/outcome-plan';
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

// senza populate i ref del foglio non sono risolvibili sul filo: si rispondono vuoti, il documento a DB resta completo
export function unpopulatedResultOf(draft: QuestResultDraft): QuestResult {
    return {
        ...draft,
        id: draft._id.toHexString(),
        consumablesUsed: [],
        spellsUsed: draft.spellsUsed.map(({ usages }) => ({
            spell: null,
            usages,
        })),
        rewards: { coins: draft.rewards.coins, items: [] },
        spellLearned: null,
        enemy: null,
    };
}
