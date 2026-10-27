import { Types } from 'mongoose';

// il FE riceve al più un arretrato di 50 fogli e conferma ognuno alla chiusura (D-02)
export const UNACKNOWLEDGED_RESULTS_LIMIT = 50;
// dal più vecchio; lo spareggio sull'id rende l'ordine deterministico ed è coperto dall'indice (D-05)
export const UNACKNOWLEDGED_RESULTS_SORT = { resolvedAt: 1, _id: 1 } as const;

export function unacknowledgedResultsFilterOf(userId: Types.ObjectId) {
    return { user: userId, acknowledgedAt: null };
}

// l'utente resta nel filtro come difesa: la proprietà la verifica già il guard (D-03)
export function acknowledgementFilterOf(
    resultId: Types.ObjectId,
    userId: Types.ObjectId,
) {
    return { _id: resultId, user: userId, acknowledgedAt: null };
}

export function acknowledgementUpdateOf(now: Date) {
    return { $set: { acknowledgedAt: now } };
}
