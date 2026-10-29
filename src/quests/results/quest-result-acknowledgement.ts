import { Types, UpdateWithAggregationPipeline } from 'mongoose';
import { idForms } from 'src/mongo/document-id';

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

// solo se l'utente punta ancora al morto del risultato: mai staccare un personaggio diverso (D-12)
export function deathUnlinkOf(
    userId: Types.ObjectId,
    characterId: Types.ObjectId,
) {
    return {
        filter: {
            _id: userId,
            currentCharacter: { $in: idForms(characterId) },
        },
        update: { $set: { currentCharacter: null } },
    };
}

// risultati scritti prima della conferma: il campo manca del tutto (D-04)
export const LEGACY_RESULTS_FILTER = {
    acknowledgedAt: { $exists: false },
} as const;

// il primo cold start del FE non deve ricevere lo storico: confermati all'istante della risoluzione
export function legacyResultsBackfill(): UpdateWithAggregationPipeline {
    return [{ $set: { acknowledgedAt: '$resolvedAt' } }];
}
