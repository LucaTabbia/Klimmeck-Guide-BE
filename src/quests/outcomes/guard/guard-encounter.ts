import {
    EnemyCandidate,
    fallbackPoolOf,
    PoolOptions,
} from 'src/quests/generation/enemy-pool';
import {
    ComposedEnemy,
    composeSingleThenPack,
} from 'src/quests/generation/quest-composition';
import { xpBandOf } from 'src/travel/ambush/level-bands';
import type { ChanceSource } from '../chance-source';

// scontro casuale alla conclusione di una guard (quick 261110-cgd)
export const GUARD_ENCOUNTER_CHANCE = 0.2;
export const GUARD_ENCOUNTER_MAX_ENEMIES = 3;

// come le imboscate gli animali restano nel pool (Phase 15 D-07): conta solo l'habitat city o all
const GUARD_POOL_OPTIONS: PoolOptions = { animals: 'included' };
const NO_ZONE: readonly string[] = [];

export interface GuardEncounterInput {
    level: number;
    enemies: readonly EnemyCandidate[];
    chance: ChanceSource;
}

export const rollsGuardEncounter = (chance: ChanceSource): boolean =>
    chance.next() < GUARD_ENCOUNTER_CHANCE;

// un nemico non leggendario city/all nella fascia [Facile, Medio] del livello, altrimenti un branco di 2–3 più deboli; null = nessuno scontro
export function composeGuardEncounter(
    input: GuardEncounterInput,
): ComposedEnemy[] | null {
    const pool = fallbackPoolOf(input.enemies, NO_ZONE, GUARD_POOL_OPTIONS);
    return composeSingleThenPack(
        xpBandOf(input.level),
        GUARD_ENCOUNTER_MAX_ENEMIES,
        [pool],
        input.chance,
    );
}
