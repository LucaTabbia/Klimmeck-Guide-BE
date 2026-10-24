import type { Types } from 'mongoose';
import type { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { QuestType } from 'src/models/enums/quest-type.enum';

export interface QuestUpdateInput {
    type: QuestType;
    verdicts: { characterId: Types.ObjectId; verdict: QuestOutcome }[];
    now: Date;
}

export function questUpdateOf(
    input: QuestUpdateInput,
): Record<string, unknown> | null {
    void input;
    throw new Error('not implemented');
}

export function questClaimFilter(
    questId: Types.ObjectId,
    participantIds: Types.ObjectId[] | null,
): Record<string, unknown> {
    void questId;
    void participantIds;
    throw new Error('not implemented');
}
