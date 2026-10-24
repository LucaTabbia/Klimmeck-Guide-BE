export const MAX_XP = 0;

export interface LevelRow {
    level: number;
    minXp: number;
    maxLifePoints: number;
}

export const LEVEL_TABLE: readonly LevelRow[] = [];

export interface Progression {
    xp: number;
    level: number;
    maxLifePoints: number;
    currentLifePoints: number;
}

export function levelRowFor(_xp: number): LevelRow {
    return { level: 0, minXp: 0, maxLifePoints: 0 };
}

export function progressionAfter(
    _before: { xp?: number | null; currentLifePoints?: number | null },
    _xpGained: number,
    _hpAfterOutcome: number,
): Progression {
    return { xp: 0, level: 0, maxLifePoints: 0, currentLifePoints: 0 };
}
