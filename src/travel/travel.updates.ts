import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import { TravelKind } from 'src/models/character/active-travel.model';
import { idForms } from 'src/mongo/document-id';
import { ActiveTravelDraft } from './travel-timing';

// identità del viaggio = startTime + endTime (D-12): niente id persistito
export interface TravelIdentity {
    characterId: Types.ObjectId;
    startTime: Date;
    endTime: Date;
}

export interface UnstartedSnapshot {
    status?: { activeTravel?: unknown; location?: unknown } | null;
    quests?: { pendingQuest?: unknown } | null;
}

export interface UnteleportedSnapshot {
    quests?: { pendingQuest?: unknown } | null;
}

export interface CompletedSnapshot {
    quests?: { pendingQuest?: unknown } | null;
    status?: { activeTravel?: { kind?: TravelKind } | null } | null;
}

// il filtro è la regola (Phase 4, D-21): due avvii concorrenti ⇒ uno solo trova activeTravel null
export function startTravelFilter(
    characterId: Types.ObjectId,
    location: Types.ObjectId,
): Record<string, unknown> {
    return {
        ...activeCharacterById(characterId),
        'status.activeTravel': null,
        'quests.pendingQuest': null,
        'status.location': { $in: idForms(location) },
    };
}

export function startTravelUpdate(travel: ActiveTravelDraft) {
    return { $set: { 'status.activeTravel': travel } };
}

// rilettura solo per scegliere il codice: una posizione cambiata senza viaggio né quest è un movimento concorrente
export function classifyUnstarted(fresh: UnstartedSnapshot | null): Error {
    if (!fresh) return ResourceNotFoundException.character();
    if (fresh.status?.activeTravel != null)
        return GameRuleException.travelInProgress();
    if (fresh.quests?.pendingQuest != null)
        return GameRuleException.questInProgress();
    return GameRuleException.travelInProgress();
}

// identità del viaggio + scadenza (D-12, D-13): job duplicato, rieseguito, anticipato, teleport o archivio ⇒ nessun match, nessuna scrittura
export function completionFilter(
    identity: TravelIdentity,
    now: Date,
): Record<string, unknown> {
    return {
        ...activeCharacterById(identity.characterId),
        'status.activeTravel.startTime': identity.startTime,
        'status.activeTravel.endTime': { $eq: identity.endTime, $lte: now },
    };
}

// pipeline: la meta si legge dal documento stesso nello stesso update, nessuna finestra fra lettura e scrittura
export const COMPLETION_UPDATE = [
    {
        $set: {
            'status.location': '$status.activeTravel.to',
            'status.activeTravel': null,
        },
    },
];

// documento prima dell'update: quest da far partire e tipo del viaggio per la push (D-14, D-16)
export const COMPLETION_PROJECTION = {
    'quests.pendingQuest': 1,
    'status.activeTravel.kind': 1,
} as const;

// il countdown della quest parte all'arrivo, una volta sola (D-16)
export function questCountdownFilter(
    pendingQuestId: Types.ObjectId,
): Record<string, unknown> {
    return { _id: pendingQuestId, startDate: null };
}

export function questCountdownUpdate(endTime: Date) {
    return { $set: { startDate: endTime } };
}

// solo la corsia standard blocca il teleport (D-17); un viaggio libero in corso viene cancellato
export function teleportFilter(
    characterId: Types.ObjectId,
): Record<string, unknown> {
    return {
        ...activeCharacterById(characterId),
        'quests.pendingQuest': null,
    };
}

export function teleportUpdate(poiId: Types.ObjectId) {
    return {
        $set: { 'status.location': poiId, 'status.activeTravel': null },
    };
}

// documento prima dell'update: lo startTime ricostruisce il jobId da rimuovere
export const TELEPORT_PROJECTION = {
    'status.activeTravel.startTime': 1,
} as const;

// una quest sparita alla rilettura c'era al momento della scrittura: resta QUEST_IN_PROGRESS
export function classifyUnteleported(
    fresh: UnteleportedSnapshot | null,
): Error {
    if (!fresh) return ResourceNotFoundException.character();
    return GameRuleException.questInProgress();
}

// l'istante arriva dal Clock del chiamante, mai l'ora del server Mongo: lo sweep resta testabile con FixedClock
export function dueTravelsFilter(now: Date): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        'status.activeTravel.endTime': { $lte: now },
    };
}

export const DUE_TRAVEL_PROJECTION = {
    'status.activeTravel.startTime': 1,
    'status.activeTravel.endTime': 1,
} as const;
