// ordine dei tiri per quest (le spec a seme fisso ne dipendono):
// 1. tiro del boss (solo ranghi con media, D-06): sotto BOSS_SHARE, 1 scelta del candidato nel primo pool che ne ha;
// 2. altrimenti (o senza candidati) composeEnemies: tiro della forma (SINGLE_FORM_SHARE), nessun tiro dei posti (13.1 D-09);
// 3. sempre in composeEnemies, giro per pool [zona, poi all se più ampio] → per forma, senza ritirare la forma, budget a un posto:
//    singolo 1 scelta (solo con candidati); branco per tentativo 1 tiro dei tipi + 1 per tipo + 1 per unità aggiunta.
// Ogni membro dallo stesso pool del POI (D-08 della Phase 13), mai sopra hi (13.1 D-03);
// all solo come ripiego quando la zona non serve nessuna forma
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
    ENEMY_SEATS,
    GeneratedRank,
    isBossCandidate,
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
    maxUnits: number,
    chance: ChanceSource,
): ComposedEnemy[] | null {
    const types =
        1 + Math.floor(chance.next() * Math.min(MAX_PACK_TYPES, maxUnits));
    const entries = drawTypes(candidates, types, chance);
    while (xpOf(entries) < budget.min && unitsOf(entries) < maxUnits) {
        addUnit(entries, chance);
    }
    const units = unitsOf(entries);
    const valid =
        inBand(xpOf(entries), budget) &&
        units >= MIN_PACK_UNITS &&
        units <= maxUnits;
    return valid ? entries : null;
}

// branco di nemici della fascia o inferiori, tentativi limitati (T-13-10b, 13.1 D-03); il tetto delle unità è del chiamante
const packFormWithin =
    (maxUnits: number): Form =>
    (pool, budget, cap, chance) => {
        const candidates = pool.filter(
            (enemy) => enemy.xp >= 1 && enemy.xp <= cap,
        );
        if (candidates.length === 0) return null;
        for (let attempt = 0; attempt < PACK_ATTEMPTS; attempt += 1) {
            const pack = drawPack(candidates, budget, maxUnits, chance);
            if (pack !== null) return pack;
        }
        return null;
    };

const packForm = packFormWithin(MAX_PACK_UNITS);

function bossOf(
    pool: readonly EnemyCandidate[],
    rank: GeneratedRank,
    chance: ChanceSource,
): EnemyCandidate | null {
    const candidates = pool.filter((enemy) => isBossCandidate(enemy.xp, rank));
    if (candidates.length === 0) return null;
    return candidates[indexOf(candidates.length, chance)];
}

// tiro della forma, poi giro per pool → per forma con budget e tetto dati (D-08 della Phase 13);
// riusata dalle imboscate con la fascia del livello (Phase 15 D-08, D-22)
export function composeEnemies(
    budget: XpBand,
    cap: number,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): ComposedEnemy[] | null {
    const forms =
        chance.next() < SINGLE_FORM_SHARE
            ? [singleForm, packForm]
            : [packForm, singleForm];
    return composeWithForms(forms, budget, cap, pools, chance);
}

// senza tiro della forma: prima un nemico singolo nella fascia, poi un branco di deboli entro maxUnits (scontro di guardia, quick 261110-cgd)
export function composeSingleThenPack(
    budget: XpBand,
    maxUnits: number,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): ComposedEnemy[] | null {
    return composeWithForms(
        [singleForm, packFormWithin(maxUnits)],
        budget,
        budget.max,
        pools,
        chance,
    );
}

function composeWithForms(
    forms: readonly Form[],
    budget: XpBand,
    cap: number,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): ComposedEnemy[] | null {
    for (const pool of pools) {
        for (const form of forms) {
            const enemies = form(pool, budget, cap, chance);
            if (enemies !== null) return enemies;
        }
    }
    return null;
}

// sempre un posto, solo boss e worldMission ne hanno di più (13.1 D-09);
// `all` solo se la zona non serve nessuna forma (D-08 della Phase 13)
function composeEnemyQuest(
    rank: GeneratedRank,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): Composition | null {
    const enemies = composeEnemies(
        budgetOf(rank, ENEMY_SEATS),
        RANK_XP_BANDS[rank].max,
        pools,
        chance,
    );
    return enemies
        ? { type: QuestType.enemy, rank, enemies, seats: ENEMY_SEATS }
        : null;
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
