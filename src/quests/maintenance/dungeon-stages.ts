// UNA TANTUM (Phase 12 D-25): tappe delle dungeon fisse ricomposte al primo boot reale dal branch 13.1; esce dal repo col suo migratore (13.1 D-07)
import {
    EnemyCandidate,
    fallbackPoolOf,
    zonePoolOf,
} from 'src/quests/generation/enemy-pool';
import {
    budgetOf,
    GeneratedRank,
    RANK_XP_BANDS,
    XpBand,
} from 'src/quests/generation/generation-rules';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

export const DUNGEON_STAGES_SEED = 1313;
export const DUNGEON_STAGES = { min: 2, max: 4 } as const;
export const STAGE_ATTEMPTS = 20;

export interface DungeonStage {
    enemy: string;
    quantity: number;
}

export interface DungeonStagesInput {
    rank: GeneratedRank;
    current: readonly DungeonStage[];
    poiTypes: readonly string[];
    enemies: readonly EnemyCandidate[];
    chance: ChanceSource;
}

const indexOf = (length: number, chance: ChanceSource): number =>
    Math.min(length - 1, Math.floor(chance.next() * length));

const inBudget = (xp: number, budget: XpBand): boolean =>
    xp >= budget.min && xp <= budget.max;

function sumOf(
    stages: readonly DungeonStage[],
    byId: ReadonlyMap<string, EnemyCandidate>,
): number {
    return stages.reduce(
        (sum, stage) => sum + (byId.get(stage.enemy)?.xp ?? 0) * stage.quantity,
        0,
    );
}

const isStageEnemy = (enemy: EnemyCandidate | undefined): boolean =>
    enemy !== undefined && enemy.animal === false && enemy.legendary === false;

// le dungeon sono solitarie: tutte le tappe in un solo budget a un posto (13.1 D-07)
export function isCoherentDungeon(
    stages: readonly DungeonStage[],
    byId: ReadonlyMap<string, EnemyCandidate>,
    rank: GeneratedRank,
): boolean {
    const hi = RANK_XP_BANDS[rank].max;
    const stagesFit = stages.every((stage) => {
        const enemy = byId.get(stage.enemy);
        return isStageEnemy(enemy) && (enemy?.xp ?? 0) * stage.quantity <= hi;
    });
    return (
        stagesFit &&
        stages.length >= DUNGEON_STAGES.min &&
        stages.length <= DUNGEON_STAGES.max &&
        inBudget(sumOf(stages, byId), budgetOf(rank, 1))
    );
}

// zona del POI + city, poi `all` come ripiego quando la zona non compone (D-08 della Phase 13, 13.1 D-07)
function stagePoolsOf(
    enemies: readonly EnemyCandidate[],
    poiTypes: readonly string[],
    hi: number,
): EnemyCandidate[][] {
    const fits = (enemy: EnemyCandidate) => enemy.xp >= 1 && enemy.xp <= hi;
    const zone = zonePoolOf(enemies, poiTypes).filter(fits);
    const fallback = fallbackPoolOf(enemies, poiTypes).filter(fits);
    const pools = fallback.length > zone.length ? [zone, fallback] : [zone];
    return pools.filter((pool) => pool.length > 0);
}

// il conteggio tirato per primo, poi gli altri da min a max (13.1 D-07)
function stageCountsOf(chance: ChanceSource): number[] {
    const spread = DUNGEON_STAGES.max - DUNGEON_STAGES.min + 1;
    const drawn = DUNGEON_STAGES.min + indexOf(spread, chance);
    const others = Array.from(
        { length: spread },
        (_, index) => DUNGEON_STAGES.min + index,
    ).filter((count) => count !== drawn);
    return [drawn, ...others];
}

interface StageDraw {
    pool: readonly EnemyCandidate[];
    byId: ReadonlyMap<string, EnemyCandidate>;
    budget: XpBand;
    minXp: number;
    count: number;
    chance: ChanceSource;
}

// tappa per tappa lascia posto a quelle che mancano; l'ultima chiude il budget dal basso se può
function nextStageOf(
    stages: readonly DungeonStage[],
    draw: StageDraw,
): DungeonStage | null {
    const remaining = draw.count - stages.length;
    const sum = sumOf(stages, draw.byId);
    const maxXp = draw.budget.max - sum - draw.minXp * (remaining - 1);
    const minNeeded = remaining === 1 ? Math.max(1, draw.budget.min - sum) : 1;
    const underMax = draw.pool.filter((enemy) => enemy.xp <= maxXp);
    const closing = underMax.filter((enemy) => enemy.xp >= minNeeded);
    const candidates = closing.length > 0 || remaining > 1 ? closing : underMax;
    if (candidates.length === 0) return null;
    const enemy = candidates[indexOf(candidates.length, draw.chance)];
    return { enemy: enemy.id, quantity: 1 };
}

function attemptOf(
    head: DungeonStage | null,
    draw: StageDraw,
): DungeonStage[] | null {
    const stages = head ? [head] : [];
    while (stages.length < draw.count) {
        const next = nextStageOf(stages, draw);
        if (next === null) break;
        stages.push(next);
    }
    return stages.length >= DUNGEON_STAGES.min &&
        inBudget(sumOf(stages, draw.byId), draw.budget)
        ? stages
        : null;
}

function drawStages(
    head: DungeonStage | null,
    draw: StageDraw,
): DungeonStage[] | null {
    for (let attempt = 0; attempt < STAGE_ATTEMPTS; attempt += 1) {
        const stages = attemptOf(head, draw);
        if (stages !== null) return stages;
    }
    return null;
}

// il primo nemico resta se è nel pool e lascia posto almeno a una seconda tappa (raffinamento sancito di 13.1 D-07)
function headOf(
    current: readonly DungeonStage[],
    byId: ReadonlyMap<string, EnemyCandidate>,
    room: number,
): DungeonStage | null {
    const first = current[0];
    const enemy = first ? byId.get(first.enemy) : undefined;
    if (!first || !enemy || enemy.xp * first.quantity > room) return null;
    return { enemy: first.enemy, quantity: first.quantity };
}

function stagesFromPool(
    pool: readonly EnemyCandidate[],
    current: readonly DungeonStage[],
    budget: XpBand,
    counts: readonly number[],
    chance: ChanceSource,
): DungeonStage[] | null {
    const byId = new Map(pool.map((enemy) => [enemy.id, enemy]));
    const minXp = Math.min(...pool.map((enemy) => enemy.xp));
    const head = headOf(current, byId, budget.max - minXp);
    for (const first of head ? [head, null] : [null]) {
        for (const count of counts) {
            const draw = { pool, byId, budget, minXp, count, chance };
            const stages = drawStages(first, draw);
            if (stages !== null) return stages;
        }
    }
    return null;
}

// ordine dei tiri: il numero di tappe (solo con un pool non vuoto), poi per pool [zona, all] → col primo nemico, poi senza →
// per conteggio [tirato, poi gli altri da 2 a 4] → per tentativo un tiro per tappa estratta
export function dungeonStagesOf(
    input: DungeonStagesInput,
): DungeonStage[] | null {
    const { rank, current, poiTypes, enemies, chance } = input;
    const pools = stagePoolsOf(enemies, poiTypes, RANK_XP_BANDS[rank].max);
    if (pools.length === 0) return null;
    const budget = budgetOf(rank, 1);
    const counts = stageCountsOf(chance);
    for (const pool of pools) {
        const stages = stagesFromPool(pool, current, budget, counts, chance);
        if (stages !== null) return stages;
    }
    return null;
}

// template della Phase 11 (quest-titles.ts di b4983d7), riusato solo quando il primo nemico cambia (13.1 D-07)
export const dungeonTitleOf = (enemy: string, city: string): string =>
    `Dungeon: ${enemy} presso ${city}`;
