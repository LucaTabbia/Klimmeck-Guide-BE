// una sola regola per la vita del compagno (D-24): ogni lettura e scrittura passa da qui, l'ora arriva dalla porta Clock del chiamante
import { MAX_RECOVERY_VALUE } from 'src/models/loot-item.model';

export const COMPANION_LIFE_FLOOR = 1;

const FALLBACK_COMPANION_NAME = 'Compagno';

export interface CompanionLifeInput {
    lifePoints: unknown;
    lifeAsOf: unknown;
    resting: boolean;
    maxLifePoints: unknown;
    recoveryTimeMs: unknown;
    now: Date;
}

export interface CompanionLife {
    lifePoints: number;
    fullLifeAt: Date | null;
}

const isValidDate = (value: unknown): value is Date =>
    value instanceof Date && !Number.isNaN(value.getTime());

const positiveIntegerOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1
        ? value
        : null;

const storedLifeOf = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;

const settled = (lifePoints: number): CompanionLife => ({
    lifePoints,
    fullLifeAt: null,
});

export function petRecoveryTimeOf(value: unknown): number | null {
    const time = positiveIntegerOrNull(value);
    return time !== null && time <= MAX_RECOVERY_VALUE ? time : null;
}

export function companionLifeAt(input: CompanionLifeInput): CompanionLife {
    const stored = storedLifeOf(input.lifePoints);
    const max = positiveIntegerOrNull(input.maxLifePoints);
    if (max === null) return settled(Math.max(COMPANION_LIFE_FLOOR, stored));
    const life = stored <= 0 ? max : Math.min(max, stored);
    if (!input.resting || !isValidDate(input.lifeAsOf)) return settled(life);
    const recoveryTime = petRecoveryTimeOf(input.recoveryTimeMs);
    if (recoveryTime === null || life >= max || max === 1) return settled(max);
    const asOf = input.lifeAsOf.getTime();
    const fullLifeAt = new Date(
        asOf + Math.ceil(((max - life) * recoveryTime) / (max - 1)),
    );
    const now = input.now.getTime();
    if (now >= fullLifeAt.getTime()) return settled(max);
    const regained = Math.round(((now - asOf) * (max - 1)) / recoveryTime);
    return { lifePoints: Math.min(max - 1, life + regained), fullLifeAt };
}

export function defeatedUntilOf(
    at: Date,
    recoveryTimeMs: unknown,
): Date | null {
    const recoveryTime = petRecoveryTimeOf(recoveryTimeMs);
    return recoveryTime === null ? null : new Date(at.getTime() + recoveryTime);
}

export function isPetDefeated(
    entry: { defeatedUntil?: unknown } | null | undefined,
    now: Date,
): boolean {
    const defeatedUntil = entry?.defeatedUntil;
    return (
        isValidDate(defeatedUntil) && defeatedUntil.getTime() > now.getTime()
    );
}

const isFilledString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim() !== '';

export function companionDisplayName(
    name: unknown,
    speciesName: unknown,
): string {
    if (isFilledString(name)) return name;
    if (isFilledString(speciesName)) return speciesName;
    return FALLBACK_COMPANION_NAME;
}
