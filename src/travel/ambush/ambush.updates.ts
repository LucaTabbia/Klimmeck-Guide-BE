import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import type { DrawnAmbush } from './ambush-draw';
import type { AmbushIdentity } from './ambush-job';

// il filtro è la regola (Phase 8 D-12): trigger duplicato, anticipato, teleport o sconfitta già scritta ⇒ nessun match
export function ambushFilter(
    identity: AmbushIdentity,
    now: Date,
): Record<string, unknown> {
    return {
        ...activeCharacterById(identity.characterId),
        'status.activeTravel.startTime': identity.startTime,
        'status.activeTravel.ambush.at': { $eq: identity.at, $lte: now },
    };
}

// prossima imboscata dal km, o nessuna (D-02, D-03): una sola pendente alla volta
export function ambushSkipUpdate(next: DrawnAmbush | null): {
    $set: Record<string, unknown>;
} {
    return { $set: { 'status.activeTravel.ambush': nextAmbushEntry(next) } };
}

export const nextAmbushEntry = (next: DrawnAmbush | null) =>
    next ? { ...next, attempts: 0 } : null;

// l'istante arriva dal Clock dello sweep, mai l'ora del server Mongo (D-05)
export function dueAmbushesFilter(now: Date): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        'status.activeTravel.ambush.at': { $lte: now },
    };
}

export const DUE_AMBUSH_PROJECTION = {
    'status.activeTravel.startTime': 1,
    'status.activeTravel.endTime': 1,
    'status.activeTravel.ambush': 1,
} as const;

// un errore di risoluzione in più (D-18): con l'identità riaffermata da ambushFilter
export const AMBUSH_ATTEMPT_UPDATE = {
    $inc: { 'status.activeTravel.ambush.attempts': 1 },
} as const;
