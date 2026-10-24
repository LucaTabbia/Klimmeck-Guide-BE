import type { Types } from 'mongoose';
import type {
    OutcomeCharacterSnapshot,
    OutcomeQuestSnapshot,
    QuestResultDraft,
} from './outcome-plan';

export interface RescuedPlanInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    aidQuest: OutcomeQuestSnapshot;
    userId: Types.ObjectId;
    cityMarker: Types.ObjectId | null;
    now: Date;
}

export interface RescuedPlan {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> };
    result: QuestResultDraft;
}

export interface DeathResultInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    quest: OutcomeQuestSnapshot;
    userId: Types.ObjectId;
    now: Date;
}

export function planRescued(input: RescuedPlanInput): RescuedPlan {
    void input;
    throw new Error('not implemented');
}

export function deathResultOf(input: DeathResultInput): QuestResultDraft {
    void input;
    throw new Error('not implemented');
}
