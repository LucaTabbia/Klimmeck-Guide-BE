import type { PopulateOptions } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import { Lore } from 'src/models/lore.model';

// tutti i ref che il FE seleziona sul catalogo (D-31): SDL invariato, solo comportamento
export const QUEST_CATALOG_POPULATE: PopulateOptions[] = [
    { path: 'infos.markerLocation' },
    { path: 'infos.enemy', model: Enemy.name },
    { path: 'infos.relatedLore', model: Lore.name },
    { path: 'requirements.recommendedLoot.item' },
    { path: 'prizes.prizeItem.item' },
    { path: 'prizes.randomLoot.item' },
];

interface CatalogItemEntry {
    item?: unknown;
}

export interface CatalogRefsHolder {
    infos?: { relatedLore?: unknown[] | null } | null;
    requirements?: { recommendedLoot?: CatalogItemEntry[] | null } | null;
    prizes?: {
        prizeItem?: CatalogItemEntry | null;
        randomLoot?: CatalogItemEntry[] | null;
    } | null;
}

const isResolved = (entry: CatalogItemEntry): boolean => entry.item != null;

// AssetQuantity.item è ItemUnion!: un orfano dentro [AssetQuantity!]! annullerebbe l'intera lista quests sul filo
export function dropOrphanCatalogRefs(quest: CatalogRefsHolder): void {
    const { infos, requirements, prizes } = quest;
    if (infos?.relatedLore) {
        infos.relatedLore = infos.relatedLore.filter((lore) => lore != null);
    }
    if (requirements?.recommendedLoot) {
        requirements.recommendedLoot =
            requirements.recommendedLoot.filter(isResolved);
    }
    if (prizes) {
        if (prizes.prizeItem && !isResolved(prizes.prizeItem)) {
            prizes.prizeItem = null;
        }
        if (prizes.randomLoot) {
            prizes.randomLoot = prizes.randomLoot.filter(isResolved);
        }
    }
}
