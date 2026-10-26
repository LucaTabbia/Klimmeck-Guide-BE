import { Types } from 'mongoose';

// 7 giorni dalla creazione della aid senza esito ⇒ morte di tutti i feriti (D-10): costante, nessuna env
export const AID_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// C5 rivista (utente 2026-10-25: "Il timer si cancella solo a party completo."): sospende il timeout solo una aid avviata con soccorritori registrati — il soccorso in corso decide l'esito (D-09); un party incompleto o svuotato dall'archivio non lo ferma
export const AID_TIMEOUT_NOT_IN_PROGRESS = {
    $or: [{ startedAt: null }, { registeredAdventurers: { $size: 0 } }],
} as const;

export function aidTimeoutDueAt(since: Date): Date {
    return new Date(since.getTime() + AID_TIMEOUT_MS);
}

export function isAidTimeoutDue(since: Date, now: Date): boolean {
    return aidTimeoutDueAt(since).getTime() <= now.getTime();
}

// claim della aid nella transazione del timeout: una aid conclusa, senza feriti o con il soccorso in corso non scade
export function aidTimeoutClaimFilter(
    aidQuestId: Types.ObjectId,
): Record<string, unknown> {
    return {
        _id: aidQuestId,
        concludedAt: null,
        'rescue.characters.0': { $exists: true },
        ...AID_TIMEOUT_NOT_IN_PROGRESS,
    };
}

export function aidTimeoutSuspended(aid: {
    startedAt?: Date | null;
    registeredAdventurers?: readonly unknown[] | null;
}): boolean {
    return (
        aid.startedAt != null && (aid.registeredAdventurers ?? []).length > 0
    );
}
