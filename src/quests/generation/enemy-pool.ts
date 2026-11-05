// candidato letto lean dal generatore: id hex, legendary non tipizzato perché il default non si applica in lettura
export interface EnemyCandidate {
    id: string;
    name: string;
    xp: number;
    locations: readonly string[];
    legendary: unknown;
    relatedLore: readonly string[];
    baseWeaknesses: readonly string[];
    energyWeaknesses: readonly string[];
    // calcolato dalla lore `animal` del nemico, mai un campo di Enemy (13.1 D-01)
    animal: boolean;
}

const CITY_HABITAT = 'city';
const ANYWHERE = 'all';

// fail-closed sui leggendari (D-04 della Phase 13); animali solo nelle hunt (13.1 D-01)
const isGeneratable = (enemy: EnemyCandidate): boolean =>
    enemy.legendary === false && enemy.animal === false;

const byId = (a: EnemyCandidate, b: EnemyCandidate): number =>
    a.id.localeCompare(b.id);

function livesIn(enemy: EnemyCandidate, poiTypes: readonly string[]): boolean {
    return enemy.locations.some(
        (location) =>
            location === CITY_HABITAT ||
            (location !== ANYWHERE && poiTypes.includes(location)),
    );
}

const livesAnywhere = (enemy: EnemyCandidate): boolean =>
    enemy.locations.includes(ANYWHERE);

// D-08: «nei dintorni della città» = zone del POI + habitat city; animali esclusi (13.1 D-01)
export function zonePoolOf(
    enemies: readonly EnemyCandidate[],
    poiTypes: readonly string[],
): EnemyCandidate[] {
    return enemies
        .filter((enemy) => isGeneratable(enemy) && livesIn(enemy, poiTypes))
        .sort(byId);
}

// D-08 (aggiunta 87dc392): all solo come ripiego, mai zone incompatibili
export function fallbackPoolOf(
    enemies: readonly EnemyCandidate[],
    poiTypes: readonly string[],
): EnemyCandidate[] {
    return enemies
        .filter(
            (enemy) =>
                isGeneratable(enemy) &&
                (livesIn(enemy, poiTypes) || livesAnywhere(enemy)),
        )
        .sort(byId);
}
