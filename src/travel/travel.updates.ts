import { Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import { knowledgeAdditionOf } from 'src/lore/knowledge-addition';
import { TravelKind } from 'src/models/character/active-travel.model';
import { idForms } from 'src/mongo/document-id';
import { STANDARD_LANE_FREE } from 'src/quests/acceptance/quest-lanes';
import type { AmbushReportDraft } from './ambush/ambush-plan';
import { ActiveTravelDraft } from './travel-timing';

// identità del viaggio = startTime + endTime (D-12): niente id persistito
export interface TravelIdentity {
    characterId: Types.ObjectId;
    startTime: Date;
    endTime: Date;
}

export interface UnstartedSnapshot {
    status?: {
        awaitingAid?: unknown;
        activeTravel?: unknown;
        location?: unknown;
    } | null;
    quests?: { pendingQuest?: unknown } | null;
}

export interface UnteleportedSnapshot {
    quests?: { pendingQuest?: unknown } | null;
}

export interface CompletedSnapshot {
    quests?: { pendingQuest?: unknown } | null;
    status?: {
        activeTravel?: {
            kind?: TravelKind;
            to?: unknown;
            ambushReports?: AmbushReportDraft[];
            road?: { distance?: number };
            duration?: number;
            food?: unknown;
        } | null;
    } | null;
}

// il filtro è la regola (Phase 4, D-21): due avvii concorrenti ⇒ uno solo trova activeTravel null
// il cibo e gli HP della partenza (Phase 14 D-12) arrivano come guardie extra: rete di sicurezza della transazione
export function startTravelFilter(
    characterId: Types.ObjectId,
    location: Types.ObjectId,
    guards: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        ...activeCharacterById(characterId),
        'status.awaitingAid': null,
        'status.activeTravel': null,
        ...STANDARD_LANE_FREE,
        'status.location': { $in: idForms(location) },
        ...guards,
    };
}

export function startTravelUpdate(
    travel: ActiveTravelDraft,
    mealSet: Record<string, unknown> = {},
) {
    return { $set: { 'status.activeTravel': travel, ...mealSet } };
}

// rilettura solo per scegliere il codice: una posizione cambiata senza viaggio né quest è un movimento concorrente
export function classifyUnstarted(fresh: UnstartedSnapshot | null): Error {
    if (!fresh) return ResourceNotFoundException.character();
    if (fresh.status?.awaitingAid != null)
        return GameRuleException.awaitingAid();
    if (fresh.status?.activeTravel != null)
        return GameRuleException.travelInProgress();
    if (fresh.quests?.pendingQuest != null)
        return GameRuleException.questInProgress();
    return GameRuleException.travelInProgress();
}

// identità del viaggio + scadenza (D-12, D-13): job duplicato, rieseguito, anticipato, teleport o archivio ⇒ nessun match, nessuna scrittura
// aspetta un'imboscata pendente (Phase 15 Pitfall 1): `{campo: null}` combacia anche col campo assente dei viaggi in volo al deploy
export function completionFilter(
    identity: TravelIdentity,
    now: Date,
): Record<string, unknown> {
    return {
        ...activeCharacterById(identity.characterId),
        'status.activeTravel.startTime': identity.startTime,
        'status.activeTravel.endTime': { $eq: identity.endTime, $lte: now },
        'status.activeTravel.ambush': null,
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

// documento prima dell'update: quest da far partire, tipo del viaggio per la push (D-14, D-16), report trattenuti da consegnare (Phase 15 D-13)
// la meta del before apre la geografia della città (Phase 16 D-05, C-4) e il piano del cibo per l'arrivo (Phase 20 D-07)
export const COMPLETION_PROJECTION = {
    'quests.pendingQuest': 1,
    'status.activeTravel.kind': 1,
    'status.activeTravel.to': 1,
    'status.activeTravel.ambushReports': 1,
    'status.activeTravel.road.distance': 1,
    'status.activeTravel.duration': 1,
    'status.activeTravel.food': 1,
} as const;

// l'arrivo sul marker si scrive una volta sola (D-16); la regola d'avvio resta di QuestStartService (utente 2026-10-25, D-22)
export function questArrivalFilter(
    pendingQuestId: Types.ObjectId,
): Record<string, unknown> {
    return { _id: pendingQuestId, arrivedAt: null };
}

// arrivo pianificato (D-13): un downtime del server non toglie tempo alla quest; una quest da soli parte nella stessa scrittura (D-22)
export function questArrivalUpdate(
    endTime: Date,
    startDate: Date | null = null,
) {
    return {
        $set: { arrivedAt: endTime, ...(startDate ? { startDate } : {}) },
    };
}

// solo la corsia standard blocca il teleport (D-17); un viaggio libero in corso viene cancellato
// il soccorso non blocca il teleport del GM (D-07)
export function teleportFilter(
    characterId: Types.ObjectId,
): Record<string, unknown> {
    return {
        ...activeCharacterById(characterId),
        ...STANDARD_LANE_FREE,
    };
}

// il teleport sul marker di una città insegna la sua geografia nello stesso update (Phase 16 D-05)
// il teleport a viaggio iniziato chiude come una sconfitta (Phase 20 D-06, D-17): closingSet porta solo vita e dispensa
export function teleportUpdate(
    poiId: Types.ObjectId,
    geography: readonly Types.ObjectId[] = [],
    closingSet: Record<string, unknown> = {},
) {
    return {
        $set: {
            'status.location': poiId,
            'status.activeTravel': null,
            ...closingSet,
        },
        ...knowledgeAdditionOf(geography),
    };
}

// il teleport a viaggio iniziato chiude come una sconfitta (Phase 20 D-06, D-17): ora, strada, imboscata pendente e piano del cibo
export const TELEPORT_FOOD_PROJECTION = {
    'status.activeTravel.startTime': 1,
    'status.activeTravel.duration': 1,
    'status.activeTravel.road.distance': 1,
    'status.activeTravel.ambush.km': 1,
    'status.activeTravel.food': 1,
} as const;

// documento prima dell'update: startTime e imboscata pendente ricostruiscono i jobId da rimuovere, i report si consegnano (Phase 15 D-13)
export const TELEPORT_PROJECTION = {
    'status.activeTravel.startTime': 1,
    'status.activeTravel.ambush': 1,
    'status.activeTravel.ambushReports': 1,
} as const;

// una quest sparita alla rilettura c'era al momento della scrittura: resta QUEST_IN_PROGRESS
export function classifyUnteleported(
    fresh: UnteleportedSnapshot | null,
): Error {
    if (!fresh) return ResourceNotFoundException.character();
    return GameRuleException.questInProgress();
}

// l'istante arriva dal Clock del chiamante, mai l'ora del server Mongo: lo sweep resta testabile con FixedClock
// un'imboscata pendente resta all'AmbushSweeper (D-13): risolta o annullata, ri-accoda lei il completamento
export function dueTravelsFilter(now: Date): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        'status.activeTravel.endTime': { $lte: now },
        'status.activeTravel.ambush': null,
    };
}

export const DUE_TRAVEL_PROJECTION = {
    'status.activeTravel.startTime': 1,
    'status.activeTravel.endTime': 1,
} as const;
