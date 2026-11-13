import { Types, type PopulateOptions } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import { Lore } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import { Spell } from 'src/models/spell.model';
import { cureOf } from 'src/quests/outcomes/injuries/quest-cure';

// tutti i ref che il FE seleziona sul catalogo (D-31): SDL invariato, solo comportamento
export const QUEST_CATALOG_POPULATE: PopulateOptions[] = [
    { path: 'infos.markerLocation' },
    {
        path: 'infos.enemies.enemy',
        model: Enemy.name,
        // Enemy.spells è [Spell!]!: senza populate un id nudo annullerebbe il nemico (Phase 19 D-02)
        populate: { path: 'spells', model: Spell.name },
    },
    { path: 'infos.relatedLore', model: Lore.name },
    { path: 'requirements.recommendedLoot.item' },
    { path: 'prizes.prizeItem.item' },
    { path: 'prizes.randomLoot.item' },
    { path: 'prizes.spell', model: Spell.name },
    { path: 'prizes.pet', model: Pet.name },
    // stessi quattro ref dentro ogni blocco per titolo (D-05): un orfano annullerebbe la lista quests (Pitfall 1)
    { path: 'prizes.rankPrizes.prizeItem.item' },
    { path: 'prizes.rankPrizes.randomLoot.item' },
    { path: 'prizes.rankPrizes.spell', model: Spell.name },
    { path: 'prizes.rankPrizes.pet', model: Pet.name },
];

interface CatalogItemEntry {
    item?: unknown;
}

export interface QuestEnemyEntry {
    enemy?: unknown;
}

export interface PrizeRefsHolder {
    prizeItem?: CatalogItemEntry | null;
    randomLoot?: CatalogItemEntry[] | null;
    pet?: unknown;
    cure?: unknown;
}

export interface CatalogRefsHolder {
    infos?: {
        relatedLore?: unknown[] | null;
        enemies?: QuestEnemyEntry[] | null;
    } | null;
    requirements?: { recommendedLoot?: CatalogItemEntry[] | null } | null;
    prizes?:
        | (PrizeRefsHolder & { rankPrizes?: PrizeRefsHolder[] | null })
        | null;
}

// risolto = documento popolato; un ObjectId grezzo è un ref rimasto tale (refPath irrisolto o documento cancellato, D-28)
export const isResolvedRef = (value: unknown): boolean =>
    value != null &&
    typeof value === 'object' &&
    !(value instanceof Types.ObjectId);

// un item rimasto ObjectId perché itemType manca sul filo farebbe fallire ItemUnion
export const isResolvedItemEntry = (entry: CatalogItemEntry): boolean =>
    isResolvedRef(entry.item);

export const isResolvedEnemyEntry = (entry: QuestEnemyEntry | null): boolean =>
    isResolvedRef(entry?.enemy);

// AssetQuantity.item è ItemUnion!: un orfano dentro [AssetQuantity!]! annullerebbe l'intera lista quests sul filo
// Enemy! dentro [QuestEnemy!]! e un Pet orfano annullerebbero l'intera lista quests sul filo (Pitfall 1)
export function dropOrphanCatalogRefs(quest: CatalogRefsHolder): void {
    const { infos, requirements, prizes } = quest;
    if (infos?.relatedLore) {
        infos.relatedLore = infos.relatedLore.filter((lore) => lore != null);
    }
    if (infos?.enemies) {
        infos.enemies = infos.enemies.filter(isResolvedEnemyEntry);
    }
    if (requirements?.recommendedLoot) {
        requirements.recommendedLoot =
            requirements.recommendedLoot.filter(isResolvedItemEntry);
    }
    if (prizes) {
        sanitizePrizeRefs(prizes);
        // una voce non oggetto scritta a mano non deve far cadere la lista: la scarta già la lettura dei blocchi
        prizes.rankPrizes
            ?.filter((block) => block != null && typeof block === 'object')
            .forEach(sanitizePrizeRefs);
    }
}

// una sola regola per i campi di oggi e per ogni blocco per titolo (D-05)
function sanitizePrizeRefs(prizes: PrizeRefsHolder): void {
    if (prizes.prizeItem && !isResolvedItemEntry(prizes.prizeItem)) {
        prizes.prizeItem = null;
    }
    if (prizes.randomLoot) {
        prizes.randomLoot = prizes.randomLoot.filter(isResolvedItemEntry);
    }
    if (!isResolvedRef(prizes.pet)) {
        prizes.pet = null;
    }
    // sul filo la cura che il server applicherebbe: una quota mancante su Float! o un refuso sull'enum annullerebbero la lista (D-23)
    prizes.cure = cureOf(prizes.cure);
}
