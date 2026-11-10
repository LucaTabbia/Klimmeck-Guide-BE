import type { Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';

// prigione dopo l'arresto in una crime (quick 261110-cgd): finisce quando la data passa, lo sweep la azzera e notifica (quick 261110-prp)
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

// liberazione dovuta: personaggio attivo con la data non più futura, lo stesso confine di imprisonedUntilOf
export const dueReleasesFilter = (now: Date): Record<string, unknown> => ({
    ...ACTIVE_CHARACTER_FILTER,
    'status.imprisonedUntil': { $lte: now },
});

export const prisonReleaseFilter = (
    characterId: Types.ObjectId,
    now: Date,
): Record<string, unknown> => ({ _id: characterId, ...dueReleasesFilter(now) });

// il marcatore della notifica: svuotata la data, nessun altro sweep la ritrova
export const PRISON_RELEASE_UPDATE = {
    $set: { 'status.imprisonedUntil': null },
} as const;
