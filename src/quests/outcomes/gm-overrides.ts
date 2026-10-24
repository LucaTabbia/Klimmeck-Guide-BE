import type { Types } from 'mongoose';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import type { ParticipantOutcome } from './combat/combat-resolver';
import type { OutcomeCharacterSnapshot } from './outcome-plan';

export interface OverrideParticipant {
    characterId: Types.ObjectId;
    currentLifePoints: number;
    maxLifePoints: number;
    ownedLoot: ReadonlyMap<string, number>;
    activeSpells: ReadonlyMap<string, number>;
}

export function overrideParticipantOf(
    _snapshot: OutcomeCharacterSnapshot,
): OverrideParticipant {
    throw new Error('not implemented');
}

export function validateOverrides(
    _overrides: readonly ParticipantOverrideInput[] | null | undefined,
    _participants: readonly OverrideParticipant[],
): Map<string, ParticipantOutcome | null> {
    throw new Error('not implemented');
}
