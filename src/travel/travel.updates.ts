import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import { ActiveTravelDraft } from './travel-timing';

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

export function startTravelFilter(
    _characterId: Types.ObjectId,
    _location: Types.ObjectId,
): Record<string, unknown> {
    throw new Error('not implemented');
}

export function startTravelUpdate(_travel: ActiveTravelDraft) {
    throw new Error('not implemented');
}

export function classifyUnstarted(_fresh: UnstartedSnapshot | null): Error {
    throw new Error('not implemented');
}

export function completionFilter(
    _identity: TravelIdentity,
    _now: Date,
): Record<string, unknown> {
    throw new Error('not implemented');
}

export const COMPLETION_UPDATE: Record<string, unknown>[] = [];

export const COMPLETION_PROJECTION = {};

export function questCountdownFilter(
    _pendingQuestId: Types.ObjectId,
): Record<string, unknown> {
    throw new Error('not implemented');
}

export function questCountdownUpdate(_endTime: Date) {
    throw new Error('not implemented');
}

export function teleportFilter(
    _characterId: Types.ObjectId,
): Record<string, unknown> {
    throw new Error('not implemented');
}

export function teleportUpdate(_poiId: Types.ObjectId) {
    throw new Error('not implemented');
}

export const TELEPORT_PROJECTION = {};

export function classifyUnteleported(
    _fresh: UnteleportedSnapshot | null,
): Error {
    throw new Error('not implemented');
}

export function dueTravelsFilter(_now: Date): Record<string, unknown> {
    throw new Error('not implemented');
}

export const DUE_TRAVEL_PROJECTION = {};
