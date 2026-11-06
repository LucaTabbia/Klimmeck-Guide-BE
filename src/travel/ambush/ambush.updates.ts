import { activeCharacterById } from 'src/models/character/active-character.filter';
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
