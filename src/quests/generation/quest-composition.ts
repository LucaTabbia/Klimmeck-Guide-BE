// ogni membro di un branco dallo stesso pool del POI (D-08, utente 2026-11-04):
// all solo come ripiego quando la zona non compone la forma
import { TitleType } from 'src/models/enums/title-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    EnemyCandidate,
    fallbackPoolOf,
    zonePoolOf,
} from 'src/quests/generation/enemy-pool';
import {
    BOSS_PARTY_AVERAGE_PE,
    BOSS_SHARE,
    bossSeatsOf,
    GeneratedRank,
    isBossCandidate,
    LEGEND_PACK_UNITS,
    MAX_PACK_TYPES,
    MAX_PACK_UNITS,
    PACK_ATTEMPTS,
    RANK_XP_BANDS,
    SINGLE_FORM_SHARE,
    XpBand,
} from 'src/quests/generation/generation-rules';

export interface ComposedEnemy {
    enemy: EnemyCandidate;
    quantity: number;
}

export interface Composition {
    type: QuestType.enemy | QuestType.boss;
    rank: GeneratedRank;
    enemies: ComposedEnemy[];
    seats: number;
}

export interface CompositionInput {
    rank: GeneratedRank;
    enemies: readonly EnemyCandidate[];
    poiTypes: readonly string[];
    chance: ChanceSource;
}

type Form = (
    pool: readonly EnemyCandidate[],
    band: XpBand,
    chance: ChanceSource,
) => ComposedEnemy[] | null;

const ENEMY_SEATS = 1;
const MIN_PACK_UNITS = 2;

const indexOf = (length: number, chance: ChanceSource): number =>
    Math.min(length - 1, Math.floor(chance.next() * length));

const inBand = (xp: number, band: XpBand): boolean =>
    xp >= band.min && xp <= band.max;

const unitsOf = (entries: readonly ComposedEnemy[]): number =>
    entries.reduce((sum, entry) => sum + entry.quantity, 0);

const xpOf = (entries: readonly ComposedEnemy[]): number =>
    entries.reduce((sum, entry) => sum + entry.enemy.xp * entry.quantity, 0);

// tipi distinti, quantità 1, nell'ordine di scelta
function drawTypes(
    candidates: readonly EnemyCandidate[],
    count: number,
    chance: ChanceSource,
): ComposedEnemy[] {
    const remaining = [...candidates];
    const entries: ComposedEnemy[] = [];
    while (entries.length < count && remaining.length > 0) {
        const [enemy] = remaining.splice(indexOf(remaining.length, chance), 1);
        entries.push({ enemy, quantity: 1 });
    }
    return entries;
}

const addUnit = (entries: ComposedEnemy[], chance: ChanceSource): void => {
    entries[indexOf(entries.length, chance)].quantity += 1;
};

// forma (a) di D-07: un nemico con xp nella fascia
const singleForm: Form = (pool, band, chance) => {
    const candidates = pool.filter((enemy) => inBand(enemy.xp, band));
    if (candidates.length === 0) return null;
    return [
        { enemy: candidates[indexOf(candidates.length, chance)], quantity: 1 },
    ];
};

function drawPack(
    candidates: readonly EnemyCandidate[],
    band: XpBand,
    chance: ChanceSource,
): ComposedEnemy[] | null {
    const types = 1 + Math.floor(chance.next() * MAX_PACK_TYPES);
    const entries = drawTypes(candidates, types, chance);
    while (xpOf(entries) < band.min && unitsOf(entries) < MAX_PACK_UNITS) {
        addUnit(entries, chance);
    }
    const units = unitsOf(entries);
    const valid =
        inBand(xpOf(entries), band) &&
        units >= MIN_PACK_UNITS &&
        units <= MAX_PACK_UNITS;
    return valid ? entries : null;
}

// forma (b) di D-07: mai un nemico della fascia o superiore, tentativi limitati (T-13-10b)
const packForm: Form = (pool, band, chance) => {
    const candidates = pool.filter(
        (enemy) => enemy.xp >= 1 && enemy.xp < band.min,
    );
    if (candidates.length === 0) return null;
    for (let attempt = 0; attempt < PACK_ATTEMPTS; attempt += 1) {
        const pack = drawPack(candidates, band, chance);
        if (pack !== null) return pack;
    }
    return null;
};

// D-07 emendata: legend = branco di 2–4 nemici della fascia hero, somma sempre nella fascia legend
function legendPack(
    pool: readonly EnemyCandidate[],
    chance: ChanceSource,
): ComposedEnemy[] | null {
    const hero = RANK_XP_BANDS[TitleType.hero];
    const candidates = pool.filter((enemy) => inBand(enemy.xp, hero));
    if (candidates.length === 0) return null;
    const spread = LEGEND_PACK_UNITS.max - LEGEND_PACK_UNITS.min + 1;
    const units = LEGEND_PACK_UNITS.min + indexOf(spread, chance);
    const types = 1 + indexOf(Math.min(MAX_PACK_TYPES, units), chance);
    const entries = drawTypes(candidates, types, chance);
    while (unitsOf(entries) < units) addUnit(entries, chance);
    return entries;
}

function bossOf(
    pool: readonly EnemyCandidate[],
    rank: GeneratedRank,
    chance: ChanceSource,
): EnemyCandidate | null {
    const candidates = pool.filter((enemy) => isBossCandidate(enemy.xp, rank));
    if (candidates.length === 0) return null;
    return candidates[indexOf(candidates.length, chance)];
}

const enemyQuest = (
    rank: GeneratedRank,
    enemies: ComposedEnemy[],
): Composition => ({
    type: QuestType.enemy,
    rank,
    enemies,
    seats: ENEMY_SEATS,
});

function composeEnemyQuest(
    rank: GeneratedRank,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): Composition | null {
    const band = RANK_XP_BANDS[rank];
    const forms =
        chance.next() < SINGLE_FORM_SHARE
            ? [singleForm, packForm]
            : [packForm, singleForm];
    for (const pool of pools) {
        for (const form of forms) {
            const enemies = form(pool, band, chance);
            if (enemies !== null) return enemyQuest(rank, enemies);
        }
    }
    return null;
}

function composeLegendQuest(
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): Composition | null {
    for (const pool of pools) {
        const enemies = legendPack(pool, chance);
        if (enemies !== null) return enemyQuest(TitleType.legend, enemies);
    }
    return null;
}

// D-05/D-06: un solo nemico di fascia superiore, posti dalla formula, 1 volta su 10
function composeBossQuest(
    rank: GeneratedRank,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): Composition | null {
    const average = BOSS_PARTY_AVERAGE_PE[rank];
    if (average === undefined || chance.next() >= BOSS_SHARE) return null;
    for (const pool of pools) {
        const boss = bossOf(pool, rank, chance);
        if (boss === null) continue;
        return {
            type: QuestType.boss,
            rank,
            enemies: [{ enemy: boss, quantity: 1 }],
            seats: bossSeatsOf(boss.xp, average),
        };
    }
    return null;
}

export function composeQuest(input: CompositionInput): Composition | null {
    const { rank, enemies, poiTypes, chance } = input;
    const zone = zonePoolOf(enemies, poiTypes);
    const fallback = fallbackPoolOf(enemies, poiTypes);
    const pools = fallback.length > zone.length ? [zone, fallback] : [zone];
    if (rank === TitleType.legend) return composeLegendQuest(pools, chance);
    return (
        composeBossQuest(rank, pools, chance) ??
        composeEnemyQuest(rank, pools, chance)
    );
}
