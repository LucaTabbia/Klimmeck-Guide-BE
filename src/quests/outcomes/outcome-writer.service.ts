import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import type { AidQuestDraft } from './aid/aid-quest';
import type { ParticipantPlan, QuestResultDraft } from './outcome-plan';

// sentinella: la transazione abortisce senza scrivere e il trigger diventa no-op (non è un TransientTransactionError, non viene rieseguita)
export class StaleResolution extends Error {
    constructor() {
        super('stale quest resolution');
    }
}

export interface CommittedOutcome {
    results: { resultId: Types.ObjectId; userId: Types.ObjectId }[];
    aids: { aidQuestId: Types.ObjectId; since: Date }[];
    spellRecoveries: {
        characterId: string;
        spellId: string;
        delayMs: number;
    }[];
}

export const EMPTY_COMMITTED: CommittedOutcome = {
    results: [],
    aids: [],
    spellRecoveries: [],
};

export type QuestWriteMode = 'claim' | 'bestEffort';

@Injectable()
export class OutcomeWriter {
    constructor(..._deps: unknown[]) {}

    writeParticipant(
        _plan: ParticipantPlan,
        _session: ClientSession,
    ): Promise<void> {
        throw new Error('not implemented');
    }

    writeCharacterUpdate(
        _filter: Record<string, unknown>,
        _update: Record<string, unknown>,
        _session: ClientSession,
    ): Promise<void> {
        throw new Error('not implemented');
    }

    writeResult(
        _result: QuestResultDraft,
        _session: ClientSession,
    ): Promise<void> {
        throw new Error('not implemented');
    }

    deletePendingQuest(
        _pendingQuestId: Types.ObjectId,
        _session: ClientSession,
    ): Promise<void> {
        throw new Error('not implemented');
    }

    updateQuest(
        _filter: Record<string, unknown>,
        _update: Record<string, unknown> | null,
        _session: ClientSession,
        _mode: QuestWriteMode,
    ): Promise<void> {
        throw new Error('not implemented');
    }

    createAid(_draft: AidQuestDraft, _session: ClientSession): Promise<void> {
        throw new Error('not implemented');
    }

    deliver(_committed: CommittedOutcome): Promise<void> {
        throw new Error('not implemented');
    }
}
