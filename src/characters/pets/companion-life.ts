// una sola regola per la vita del compagno (D-24): ogni lettura e scrittura passa da qui, l'ora arriva dalla porta Clock del chiamante
import { MAX_RECOVERY_VALUE } from 'src/models/loot-item.model';
import { isSavedCompanionLevel } from './companion-level';

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

// regole 1-2: minimo 1 senza un massimo leggibile, vita legacy (0 o non numerica) = piena, tetto al massimo
export function companionLifeNow(
    lifePoints: unknown,
    maxLifePoints: unknown,
): number {
    const stored = storedLifeOf(lifePoints);
    const max = positiveIntegerOrNull(maxLifePoints);
    if (max === null) return Math.max(COMPANION_LIFE_FLOOR, stored);
    return stored <= 0 ? max : Math.min(max, stored);
}

export function companionLifeAt(input: CompanionLifeInput): CompanionLife {
    const life = companionLifeNow(input.lifePoints, input.maxLifePoints);
    const max = positiveIntegerOrNull(input.maxLifePoints);
    if (max === null || !input.resting || !isValidDate(input.lifeAsOf)) {
        return settled(life);
    }
    const recoveryTime = petRecoveryTimeOf(input.recoveryTimeMs);
    if (recoveryTime === null || life >= max || max === 1) return settled(max);
    const asOf = input.lifeAsOf.getTime();
    const fullLifeAt = new Date(
        asOf + Math.ceil(((max - life) * recoveryTime) / (max - 1)),
    );
    const now = input.now.getTime();
    if (now >= fullLifeAt.getTime()) return settled(max);
    // un'ancora più avanti dell'orologio non toglie vita: si recupera solo dal suo istante in poi
    const elapsed = Math.max(0, now - asOf);
    const regained = Math.round((elapsed * (max - 1)) / recoveryTime);
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

export function isLegacyCompanionEntry(
    entry: { level?: unknown; lifeAsOf?: unknown } | null | undefined,
): boolean {
    return (
        !isSavedCompanionLevel(entry?.level) && !isValidDate(entry?.lifeAsOf)
    );
}

// voce mai toccata dalla fase (D-23, D-38): piena al massimo del compagno; la regola si spegne alla prima scrittura
export function companionStoredLifeOf(
    entry:
        | { currentLifePoints?: unknown; level?: unknown; lifeAsOf?: unknown }
        | null
        | undefined,
    maxLifePoints: unknown,
): number {
    const max = positiveIntegerOrNull(maxLifePoints);
    if (max !== null && isLegacyCompanionEntry(entry)) return max;
    return companionLifeNow(entry?.currentLifePoints, maxLifePoints);
}
