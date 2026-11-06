import {
    EnemyCandidate,
    fallbackPoolOf,
    PoolOptions,
    zonePoolOf,
} from 'src/quests/generation/enemy-pool';
import {
    ComposedEnemy,
    composeEnemies,
} from 'src/quests/generation/quest-composition';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { xpBandOf } from 'src/travel/ambush/level-bands';

export const AMBUSH_POOL_OPTIONS: PoolOptions = { animals: 'included' };

export interface AmbushCompositionInput {
    level: number;
    poiTypes: readonly string[];
    enemies: readonly EnemyCandidate[];
    chance: ChanceSource;
}

// zona del POI più vicino + animali + city, mai leggendari, all di riserva (D-06, D-07);
// fascia [Facile, Medio] del livello come budget e tetto (D-08)
export function composeAmbushEnemies(
    input: AmbushCompositionInput,
): ComposedEnemy[] | null {
    const band = xpBandOf(input.level);
    const zone = zonePoolOf(input.enemies, input.poiTypes, AMBUSH_POOL_OPTIONS);
    const fallback = fallbackPoolOf(
        input.enemies,
        input.poiTypes,
        AMBUSH_POOL_OPTIONS,
    );
    const pools = fallback.length > zone.length ? [zone, fallback] : [zone];
    return composeEnemies(band, band.max, pools, input.chance);
}
