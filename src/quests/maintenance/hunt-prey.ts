// UNA TANTUM (Phase 12 D-25): regole della preda delle hunt per il primo boot reale dal branch 13.1; esce dal repo col suo migratore (13.1 D-07)
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GENERATED_RANKS,
    GeneratedRank,
    RANK_XP_BANDS,
} from 'src/quests/generation/generation-rules';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

export const HUNT_PREY_SEED = 131;

export interface HuntRewrite {
    prey: EnemyCandidate;
    minTitle: GeneratedRank;
    title: string;
    description: string;
    relatedLore: string[];
}

export interface HuntCity {
    name: string;
    relatedLore: string | null;
}

// la fascia che contiene xp; sopra il massimo hero nessuna (solo boss)
export function rankOfXp(xp: number): GeneratedRank | null {
    return (
        GENERATED_RANKS.find(
            (rank) =>
                xp >= RANK_XP_BANDS[rank].min && xp <= RANK_XP_BANDS[rank].max,
        ) ?? null
    );
}

const byId = (a: EnemyCandidate, b: EnemyCandidate): number =>
    a.id.localeCompare(b.id);

// «la caccia segue la preda»: animali non leggendari la cui locations incrocia i type del POI, senza city né all, nessun tetto oltre la fascia hero
export function huntPreyPoolOf(
    enemies: readonly EnemyCandidate[],
    poiTypes: readonly string[],
): EnemyCandidate[] {
    return enemies
        .filter(
            (enemy) =>
                enemy.animal === true &&
                enemy.legendary === false &&
                rankOfXp(enemy.xp) !== null &&
                enemy.locations.some((location) => poiTypes.includes(location)),
        )
        .sort(byId);
}

export function isCoherentHunt(
    preyId: string | null,
    pool: readonly EnemyCandidate[],
    minTitle: unknown,
): boolean {
    const prey = pool.find((enemy) => enemy.id === preyId);
    return prey !== undefined && rankOfXp(prey.xp) === minTitle;
}

export const huntTitleOf = (city: string, prey: string): string =>
    `Caccia: ${prey} nei dintorni di ${city}`;

export const huntDescriptionOf = (city: string, prey: string): string =>
    `Sono un cacciatore di ${city} e da solo non ce la faccio più. Cerco compagni per stanare una preda pericolosa: ${prey}.`;

export function huntRewriteOf(input: {
    pool: readonly EnemyCandidate[];
    city: HuntCity;
    chance: ChanceSource;
}): HuntRewrite | null {
    const { pool, city, chance } = input;
    if (pool.length === 0) return null;
    const prey =
        pool[
            Math.min(pool.length - 1, Math.floor(chance.next() * pool.length))
        ];
    const minTitle = rankOfXp(prey.xp);
    if (minTitle === null) return null;
    return {
        prey,
        minTitle,
        title: huntTitleOf(city.name, prey.name),
        description: huntDescriptionOf(city.name, prey.name),
        relatedLore: [
            ...new Set([
                ...(city.relatedLore ? [city.relatedLore] : []),
                ...prey.relatedLore,
            ]),
        ],
    };
}
