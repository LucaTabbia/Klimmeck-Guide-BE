import { Types } from 'mongoose';

// 7 giorni dalla creazione della aid senza esito ⇒ morte del ferito (D-10): costante, nessuna env
export const AID_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// C5 (default tecnico provvisorio da confermare con l'utente): il timeout resta sospeso finché la aid ha un soccorritore registrato,
// il soccorso in corso decide l'esito (D-09). Per la lettura letterale dei 7 giorni togliere questa riga e il test nominato.
export const AID_TIMEOUT_REQUIRES_NO_RESCUER = {
    registeredAdventurers: { $size: 0 },
} as const;

export function aidTimeoutDueAt(since: Date): Date {
    return new Date(since.getTime() + AID_TIMEOUT_MS);
}

export function isAidTimeoutDue(since: Date, now: Date): boolean {
    return aidTimeoutDueAt(since).getTime() <= now.getTime();
}

// claim della aid nella transazione del timeout: una aid conclusa, senza soccorso o con un soccorritore non scade
export function aidTimeoutClaimFilter(
    aidQuestId: Types.ObjectId,
): Record<string, unknown> {
    return {
        _id: aidQuestId,
        concludedAt: null,
        'rescue.character': { $ne: null },
        ...AID_TIMEOUT_REQUIRES_NO_RESCUER,
    };
}

export function aidTimeoutSuspended(aid: {
    registeredAdventurers?: readonly unknown[] | null;
}): boolean {
    return (aid.registeredAdventurers ?? []).length > 0;
}
