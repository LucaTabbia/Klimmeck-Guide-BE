// tabella unica (D-12): unico punto da cui si leggono livello e HP massimi; curva triangolare confermata dall'utente
export const MAX_XP = 50_000;
// il motore non uccide mai direttamente (D-07)
export const MIN_LIFE_POINTS = 1;

export const LEVEL_TABLE = [
    { level: 1, minXp: 0, maxLifePoints: 1_000 },
    { level: 2, minXp: 250, maxLifePoints: 1_200 },
    { level: 3, minXp: 800, maxLifePoints: 1_600 },
    { level: 4, minXp: 1_600, maxLifePoints: 2_250 },
    { level: 5, minXp: 2_650, maxLifePoints: 3_050 },
    { level: 6, minXp: 3_950, maxLifePoints: 4_100 },
    { level: 7, minXp: 5_500, maxLifePoints: 5_300 },
    { level: 8, minXp: 7_350, maxLifePoints: 6_750 },
    { level: 9, minXp: 9_450, maxLifePoints: 8_400 },
    { level: 10, minXp: 11_850, maxLifePoints: 10_250 },
    { level: 11, minXp: 14_450, maxLifePoints: 12_300 },
    { level: 12, minXp: 17_350, maxLifePoints: 14_550 },
    { level: 13, minXp: 20_550, maxLifePoints: 17_000 },
    { level: 14, minXp: 23_950, maxLifePoints: 19_700 },
    { level: 15, minXp: 27_650, maxLifePoints: 22_550 },
    { level: 16, minXp: 31_600, maxLifePoints: 25_650 },
    { level: 17, minXp: 35_800, maxLifePoints: 28_900 },
    { level: 18, minXp: 40_250, maxLifePoints: 32_400 },
    { level: 19, minXp: 45_000, maxLifePoints: 36_100 },
    { level: 20, minXp: 50_000, maxLifePoints: 40_000 },
] as const;

export type LevelRow = (typeof LEVEL_TABLE)[number];

export interface Progression {
    xp: number;
    level: number;
    maxLifePoints: number;
    currentLifePoints: number;
}

const nonNegative = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;

export function levelRowFor(xp: number): LevelRow {
    let row: LevelRow = LEVEL_TABLE[0];
    for (const candidate of LEVEL_TABLE) {
        if (xp >= candidate.minXp) row = candidate;
    }
    return row;
}

// il resolver o il GM possono sbagliare: HP fra 1 e il massimo, mai NaN (D-07, T-09-22)
export const lifePointsWithin = (hp: number, max: number): number =>
    Number.isFinite(hp)
        ? Math.min(max, Math.max(MIN_LIFE_POINTS, Math.floor(hp)))
        : MIN_LIFE_POINTS;

// XP clampata (D-11), livello e massimo dalla tabella, nessuna cura al level up (D-12): solo clamp fra 1 e il nuovo massimo
export function progressionAfter(
    before: { xp?: number | null; currentLifePoints?: number | null },
    xpGained: number,
    hpAfterOutcome: number,
): Progression {
    const xp = Math.min(MAX_XP, nonNegative(before.xp) + nonNegative(xpGained));
    const row = levelRowFor(xp);
    return {
        xp,
        level: row.level,
        maxLifePoints: row.maxLifePoints,
        currentLifePoints: lifePointsWithin(hpAfterOutcome, row.maxLifePoints),
    };
}
