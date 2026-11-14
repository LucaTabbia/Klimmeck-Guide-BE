// livelli del compagno (D-37, D-38, D-39): livello dall'xp, salvato sulla voce da chi scrive l'xp; la vita massima si deriva sempre, mai salvata; ogni massimo di un compagno posseduto passa da qui
import { isPetXpCap } from 'src/quests/outcomes/pets/pet-xp';

export const COMPANION_LEVELS = 10;

// t(10): numero triangolare dell'ultimo livello, la vita raddoppia al tetto
const LAST_LEVEL_STEPS = (COMPANION_LEVELS * (COMPANION_LEVELS - 1)) / 2;

export interface CompanionLevel {
    level: number;
    maxLifePoints: number | null;
}

const levelSteps = (level: number): number => (level * (level - 1)) / 2;

const LEVELS = Array.from(
    { length: COMPANION_LEVELS },
    (_, index) => index + 1,
);

// xp della voce: numero ≥ 0 arrotondato per difetto, altrimenti 0; helper locale perché il modulo delle voci importa questo
const xpOf = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : 0;

const isBaseLife = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1;

export function companionLevelThresholds(maxXp: number): number[] {
    return LEVELS.map((level) =>
        Math.round((maxXp * levelSteps(level)) / LAST_LEVEL_STEPS),
    );
}

export function isSavedCompanionLevel(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= COMPANION_LEVELS
    );
}

export function companionLevelFromXp(xp: unknown, maxXp: unknown): number {
    if (!isPetXpCap(maxXp)) return 1;
    const owned = xpOf(xp);
    const thresholds = companionLevelThresholds(maxXp);
    return thresholds.filter((threshold) => owned >= threshold).length;
}

export function companionMaxLifeAt(
    level: number,
    baseLifePoints: unknown,
): number | null {
    if (!isBaseLife(baseLifePoints)) return null;
    return Math.round(
        baseLifePoints * (1 + levelSteps(level) / LAST_LEVEL_STEPS),
    );
}

export function companionLevelOf(
    xp: unknown,
    maxXp: unknown,
    baseLifePoints: unknown,
): CompanionLevel {
    const level = companionLevelFromXp(xp, maxXp);
    return { level, maxLifePoints: companionMaxLifeAt(level, baseLifePoints) };
}

export function companionStoredLevelOf(
    entry: { xp?: unknown; level?: unknown } | null | undefined,
    pet: { maxXp?: unknown } | null | undefined,
): number {
    const saved = entry?.level;
    return isSavedCompanionLevel(saved)
        ? saved
        : companionLevelFromXp(entry?.xp, pet?.maxXp);
}

export function companionMaxLifeOf(
    entry: { xp?: unknown; level?: unknown } | null | undefined,
    pet: { maxXp?: unknown; maxLifePoints?: unknown } | null | undefined,
): number | null {
    return companionMaxLifeAt(
        companionStoredLevelOf(entry, pet),
        pet?.maxLifePoints,
    );
}
