// ordine dei tiri per quest: tiro del boss (solo ranghi con media, D-06) → se boss, scelta del candidato;
// altrimenti posti (enemySeatsOf) → forma (SINGLE_FORM_SHARE) → per forma: singolo 1 scelta;
// branco per tentativo 1 tiro dei tipi + 1 per tipo + 1 per unità aggiunta.
// Ogni membro dallo stesso pool del POI (D-08 della Phase 13), mai sopra hi (13.1 D-03);
// all solo come ripiego quando la zona non compone la forma
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
    bossSeatsFor,
    budgetOf,
    enemySeatsOf,
    GeneratedRank,
    isBossCandidate,
    MAX_ENEMY_SEATS,
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
    budget: XpBand,
    cap: number,
    chance: ChanceSource,
) => ComposedEnemy[] | null;

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

// un nemico con xp nel budget, mai sopra la fascia (13.1 D-03)
const singleForm: Form = (pool, budget, cap, chance) => {
    const candidates = pool.filter(
        (enemy) =>
            enemy.xp >= budget.min && enemy.xp <= Math.min(budget.max, cap),
    );
    if (candidates.length === 0) return null;
    return [
        { enemy: candidates[indexOf(candidates.length, chance)], quantity: 1 },
    ];
};

function drawPack(
    candidates: readonly EnemyCandidate[],
    budget: XpBand,
    chance: ChanceSource,
): ComposedEnemy[] | null {
    const types = 1 + Math.floor(chance.next() * MAX_PACK_TYPES);
    const entries = drawTypes(candidates, types, chance);
    while (xpOf(entries) < budget.min && unitsOf(entries) < MAX_PACK_UNITS) {
        addUnit(entries, chance);
    }
    const units = unitsOf(entries);
    const valid =
        inBand(xpOf(entries), budget) &&
        units >= MIN_PACK_UNITS &&
        units <= MAX_PACK_UNITS;
    return valid ? entries : null;
}

// branco di nemici della fascia o inferiori, tentativi limitati (T-13-10b, 13.1 D-03)
const packForm: Form = (pool, budget, cap, chance) => {
    const candidates = pool.filter((enemy) => enemy.xp >= 1 && enemy.xp <= cap);
    if (candidates.length === 0) return null;
    for (let attempt = 0; attempt < PACK_ATTEMPTS; attempt += 1) {
        const pack = drawPack(candidates, budget, chance);
        if (pack !== null) return pack;
    }
    return null;
};

function bossOf(
    pool: readonly EnemyCandidate[],
    rank: GeneratedRank,
    chance: ChanceSource,
): EnemyCandidate | null {
    const candidates = pool.filter((enemy) => isBossCandidate(enemy.xp, rank));
    if (candidates.length === 0) return null;
    return candidates[indexOf(candidates.length, chance)];
}

// S = 2 non componibile ⇒ ripiego a un posto prima di cambiare rango (13.1 D-03);
// `all` solo se la zona non serve nessuna forma con nessun numero di posti (D-08 della Phase 13)
function composeEnemyQuest(
    rank: GeneratedRank,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): Composition | null {
    const rolled = enemySeatsOf(chance.next());
    const forms =
        chance.next() < SINGLE_FORM_SHARE
            ? [singleForm, packForm]
            : [packForm, singleForm];
    const cap = RANK_XP_BANDS[rank].max;
    const seatCounts = rolled === 1 ? [1] : [MAX_ENEMY_SEATS, 1];
    for (const pool of pools) {
        for (const seats of seatCounts) {
            const budget = budgetOf(rank, seats);
            for (const form of forms) {
                const enemies = form(pool, budget, cap, chance);
                if (enemies !== null) {
                    return { type: QuestType.enemy, rank, enemies, seats };
                }
            }
        }
    }
    return null;
}

// un solo nemico sopra la fascia, posti di bossSeatsFor, 1 volta su 10 (D-05/D-06 della Phase 13, 13.1 D-03)
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
        const seats = bossSeatsFor(boss.xp, rank);
        if (seats === null) continue;
        return {
            type: QuestType.boss,
            rank,
            enemies: [{ enemy: boss, quantity: 1 }],
            seats,
        };
    }
    return null;
}

export function composeQuest(input: CompositionInput): Composition | null {
    const { rank, enemies, poiTypes, chance } = input;
    const zone = zonePoolOf(enemies, poiTypes);
    const fallback = fallbackPoolOf(enemies, poiTypes);
    const pools = fallback.length > zone.length ? [zone, fallback] : [zone];
    return (
        composeBossQuest(rank, pools, chance) ??
        composeEnemyQuest(rank, pools, chance)
    );
}
