import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import type { GeneratedRank } from 'src/quests/generation/generation-rules';
import {
    indexOf,
    LOOT_POOLS,
    RARITY_RANK,
    type GeneratedQuestType,
} from 'src/quests/generation/loot-pools';
import type { ChanceSource } from 'src/quests/outcomes/chance-source';

// tre fasce che si sommano su un solo tiro (Phase 19 D-28, supera la Phase 13 D-21)
export const SAME_ENEMY_PET_PRIZE_CHANCE = 0.1;
export const ZONE_PET_PRIZE_CHANCE = 0.05;
export const BOSS_PET_PRIZE_CHANCE = 0.05;

// pet letto lean dal generatore: rarità e vendibilità curate a mano a DB, quindi non tipizzate
export interface PetCandidate {
    id: string;
    rarity: string | null;
    sellable: boolean | null;
    enemyId: string | null;
    // locations del nemico collegato; vuote senza legame
    enemyLocations: readonly string[];
}

export interface PetPrizeInput {
    type: GeneratedQuestType;
    rank: GeneratedRank;
    pets: readonly PetCandidate[];
    enemyIds: readonly string[];
    poiTypes: readonly string[];
    chance: ChanceSource;
}

type Band = (pet: PetCandidate, input: PetPrizeInput) => boolean;

const CHANCE_PRECISION = 1e6;

// 0.1 + 0.05 in virgola mobile supera 0.15: i confini si arrotondano al milionesimo
const boundaryAfter = (...chances: number[]): number =>
    Math.round(
        chances.reduce((sum, chance) => sum + chance, 0) * CHANCE_PRECISION,
    ) / CHANCE_PRECISION;

const SAME_ENEMY_BAND_END = boundaryAfter(SAME_ENEMY_PET_PRIZE_CHANCE);
const ZONE_BAND_END = boundaryAfter(
    SAME_ENEMY_PET_PRIZE_CHANCE,
    ZONE_PET_PRIZE_CHANCE,
);
const BOSS_BAND_END = boundaryAfter(
    SAME_ENEMY_PET_PRIZE_CHANCE,
    ZONE_PET_PRIZE_CHANCE,
    BOSS_PET_PRIZE_CHANCE,
);

const RARITIES: readonly string[] = Object.values(RarityType);

const isRarity = (rarity: string | null): rarity is RarityType =>
    rarity !== null && RARITIES.includes(rarity);

const isLinkedToQuestEnemy: Band = (pet, input) =>
    pet.enemyId !== null && input.enemyIds.includes(pet.enemyId);

const livesInQuestZone: Band = (pet, input) =>
    !isLinkedToQuestEnemy(pet, input) &&
    pet.enemyLocations.some((location) => input.poiTypes.includes(location));

const isNeverOnSale: Band = (pet) => pet.sellable === false;

function bandOf(roll: number, type: GeneratedQuestType): Band | null {
    if (roll < SAME_ENEMY_BAND_END) return isLinkedToQuestEnemy;
    if (roll < ZONE_BAND_END) return livesInQuestZone;
    if (roll < BOSS_BAND_END && type === QuestType.boss) return isNeverOnSale;
    return null;
}

// rarità massima fra gli slot del pool di loot del rango
export function petRarityCapOf(
    type: GeneratedQuestType,
    rank: GeneratedRank,
): RarityType {
    return LOOT_POOLS[type][rank].reduce<RarityType>(
        (cap, lootSlot) =>
            RARITY_RANK[lootSlot.rarity] > RARITY_RANK[cap]
                ? lootSlot.rarity
                : cap,
        RarityType.common,
    );
}

// un tiro di fascia sempre; un tiro d'indice solo se la fascia colpita ha candidati sotto il tetto; una fascia vuota non passa alle altre
export function petPrizeOf(input: PetPrizeInput): string | null {
    const band = bandOf(input.chance.next(), input.type);
    if (band === null) return null;
    const cap = RARITY_RANK[petRarityCapOf(input.type, input.rank)];
    const candidates = input.pets
        .filter((pet) => isRarity(pet.rarity) && RARITY_RANK[pet.rarity] <= cap)
        .filter((pet) => band(pet, input))
        .sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 0) return null;
    return candidates[indexOf(candidates.length, input.chance)].id;
}
