import { GameRuleException } from 'src/gameRules/game-rule.exception';

// prigione dopo l'arresto in una crime (quick 261110-cgd): nessuno sweep di liberazione, finisce quando la data passa
export const CRIME_PRISON_MS = 10 * 60 * 60 * 1000;

export const NOT_IMPRISONED_PROJECTION = {
    'status.imprisonedUntil': 1,
} as const;

export interface ImprisonmentStatus {
    imprisonedUntil?: unknown;
}

export const prisonReleaseAfter = (concludedAt: Date): Date =>
    new Date(concludedAt.getTime() + CRIME_PRISON_MS);

// null, assente, passata o non data = libero
export function imprisonedUntilOf(
    status: ImprisonmentStatus | null | undefined,
    now: Date,
): Date | null {
    const until = status?.imprisonedUntil;
    if (!(until instanceof Date)) return null;
    return until.getTime() > now.getTime() ? until : null;
}

export function refusalWhileImprisoned(
    status: ImprisonmentStatus | null | undefined,
    now: Date,
): GameRuleException | null {
    const until = imprisonedUntilOf(status, now);
    return until ? GameRuleException.characterImprisoned(until) : null;
}

// guardia delle scritture: combacia con data assente, null o non più futura
export const notImprisonedAt = (now: Date): Record<string, unknown> => ({
    'status.imprisonedUntil': { $not: { $gt: now } },
});
