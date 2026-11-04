// UNA TANTUM (Phase 12 D-25): tappe delle 40 dungeon fisse, esce dal repo con DungeonStagesMigrator dopo il primo boot reale (D-13)
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    EnemyCandidate,
    fallbackPoolOf,
    zonePoolOf,
} from 'src/quests/generation/enemy-pool';
import {
    GeneratedRank,
    MAX_PACK_UNITS,
    RANK_XP_BANDS,
    SINGLE_FORM_SHARE,
    XpBand,
} from 'src/quests/generation/generation-rules';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

export const DUNGEON_STAGES_SEED = 13;
export const BANDIT_ID = '6ae80bf6947d6a423521c70d';
export const BANDIT_CHIEF_ID = '6ae80bf6947d6a423521c70f';
export const ADDED_STAGES = { min: 1, max: 3 } as const;

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

type StageForm = (
    pool: readonly EnemyCandidate[],
    band: XpBand,
    chance: ChanceSource,
) => DungeonStage | null;

const indexOf = (length: number, chance: ChanceSource): number =>
    Math.min(length - 1, Math.floor(chance.next() * length));

const inBand = (xp: number, band: XpBand): boolean =>
    xp >= band.min && xp <= band.max;

function pickOf<T>(items: readonly T[], chance: ChanceSource): T | null {
    return items.length === 0 ? null : items[indexOf(items.length, chance)];
}

// la quantità minima che porta un solo tipo più debole nella fascia, entro MAX_PACK_UNITS
function packQuantityOf(xp: number, band: XpBand): number | null {
    if (xp < 1 || xp >= band.min) return null;
    const quantity = Math.ceil(band.min / xp);
    return quantity <= MAX_PACK_UNITS && xp * quantity <= band.max
        ? quantity
        : null;
}

// forma (a) di D-07: un singolo nella fascia
const singleStage: StageForm = (pool, band, chance) => {
    const enemy = pickOf(
        pool.filter((candidate) => inBand(candidate.xp, band)),
        chance,
    );
    return enemy === null ? null : { enemy: enemy.id, quantity: 1 };
};

// forma (b) di D-07 ridotta a un solo tipo: N deboli la cui somma cade nella fascia
const packStage: StageForm = (pool, band, chance) =>
    pickOf(
        pool.flatMap((candidate) => {
            const quantity = packQuantityOf(candidate.xp, band);
            return quantity === null ? [] : [{ enemy: candidate.id, quantity }];
        }),
        chance,
    );

function stageOf(
    band: XpBand,
    pools: readonly (readonly EnemyCandidate[])[],
    chance: ChanceSource,
): DungeonStage | null {
    const forms =
        chance.next() < SINGLE_FORM_SHARE
            ? [singleStage, packStage]
            : [packStage, singleStage];
    for (const pool of pools) {
        for (const form of forms) {
            const stage = form(pool, band, chance);
            if (stage !== null) return stage;
        }
    }
    return null;
}

// Phase 11 handoff §11: la banda di briganti apre la dungeon dove la zona ha il Bandito; per paladin Capo + Banditi contano due tappe
function banditBandOf(
    rank: GeneratedRank,
    zone: readonly EnemyCandidate[],
    chance: ChanceSource,
): DungeonStage[] {
    const lives = (id: string) => zone.some((enemy) => enemy.id === id);
    if (!lives(BANDIT_ID)) return [];
    switch (rank) {
        case TitleType.rookie:
            return [{ enemy: BANDIT_ID, quantity: 2 + indexOf(2, chance) }];
        case TitleType.adventurer:
            return [{ enemy: BANDIT_ID, quantity: 6 + indexOf(3, chance) }];
        case TitleType.paladin:
            if (!lives(BANDIT_CHIEF_ID)) return [];
            return [
                { enemy: BANDIT_CHIEF_ID, quantity: 1 },
                { enemy: BANDIT_ID, quantity: 2 + indexOf(6, chance) },
            ];
        default:
            return [];
    }
}

// voci attuali + 1–3 tappe nella fascia del minTitle e dal pool del POI (D-08, D-13); una tappa non componibile si salta
export function dungeonStagesOf(input: DungeonStagesInput): DungeonStage[] {
    const { rank, current, poiTypes, enemies, chance } = input;
    const zone = zonePoolOf(enemies, poiTypes);
    const fallback = fallbackPoolOf(enemies, poiTypes);
    const pools = fallback.length > zone.length ? [zone, fallback] : [zone];
    const band = RANK_XP_BANDS[rank];
    const spread = ADDED_STAGES.max - ADDED_STAGES.min + 1;
    const count = ADDED_STAGES.min + indexOf(spread, chance);
    const added = banditBandOf(rank, zone, chance);
    for (let stage = added.length; stage < count; stage += 1) {
        const next = stageOf(band, pools, chance);
        if (next !== null) added.push(next);
    }
    return [...current.map((entry) => ({ ...entry })), ...added];
}
