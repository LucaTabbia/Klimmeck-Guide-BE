import type { PopulateOptions } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import { QuestResultKind } from 'src/models/enums/quest-result-kind.enum';
import { Lore } from 'src/models/lore.model';
import type { QuestResult } from 'src/models/quest-result/quest-result.model';
import { Pet } from 'src/models/pet.model';
import { Spell } from 'src/models/spell.model';
import type { QuestResultDraft } from 'src/quests/outcomes/outcome-plan';
import {
    isResolvedEnemyEntry,
    isResolvedItemEntry,
    isResolvedRef,
    type QuestEnemyEntry,
} from 'src/quests/quest-catalog.populate';

// ref che il foglio esiti seleziona (D-19, FE COMBAT-02..05): orfani tollerati come nel catalogo (Phase 8 D-31)
export const QUEST_RESULT_POPULATE: PopulateOptions[] = [
    { path: 'consumablesUsed.item' },
    { path: 'rewards.items.item' },
    { path: 'spellsUsed.spell', model: Spell.name },
    { path: 'spellLearned', model: Spell.name },
    { path: 'enemies.enemy', model: Enemy.name },
    { path: 'rewards.pet', model: Pet.name },
    { path: 'loreUnlocked', model: Lore.name },
];

interface ResultItemEntry {
    item?: unknown;
}

export interface ResultRefsHolder {
    consumablesUsed?: ResultItemEntry[] | null;
    rewards?: { items?: ResultItemEntry[] | null; pet?: unknown } | null;
    enemies?: QuestEnemyEntry[] | null;
    loreUnlocked?: unknown[] | null;
}

// AssetQuantity.item è ItemUnion!, Enemy! sta dentro [QuestEnemy!]! e loreUnlocked è [Lore!]!: una voce orfana annullerebbe l'intero risultato sul filo
export function dropOrphanResultRefs(result: ResultRefsHolder): void {
    if (result.consumablesUsed) {
        result.consumablesUsed =
            result.consumablesUsed.filter(isResolvedItemEntry);
    }
    if (result.enemies) {
        result.enemies = result.enemies.filter(isResolvedEnemyEntry);
    }
    if (result.loreUnlocked) {
        dropUnresolvedInPlace(result.loreUnlocked);
    }
    if (!result.rewards) return;
    if (result.rewards.items) {
        result.rewards.items = result.rewards.items.filter(isResolvedItemEntry);
    }
    if (!isResolvedRef(result.rewards.pet)) {
        result.rewards.pet = null;
    }
}

// riassegnare un array di documenti a un path di soli ObjectId lo depopolerebbe: si toglie in place
function dropUnresolvedInPlace(refs: unknown[]): void {
    for (let index = refs.length - 1; index >= 0; index--) {
        if (!isResolvedRef(refs[index])) refs.splice(index, 1);
    }
}

// senza populate i ref del foglio non sono risolvibili sul filo: si rispondono vuoti, il documento a DB resta completo
export function unpopulatedResultOf(draft: QuestResultDraft): QuestResult {
    return {
        ...draft,
        id: draft._id.toHexString(),
        kind: QuestResultKind.quest,
        ambush: null,
        consumablesUsed: [],
        spellsUsed: draft.spellsUsed.map(({ usages }) => ({
            spell: null,
            usages,
        })),
        rewards: { coins: draft.rewards.coins, items: [], pet: null },
        spellLearned: null,
        loreUnlocked: [],
        enemies: [],
    };
}
