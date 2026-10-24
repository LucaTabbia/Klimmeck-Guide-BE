import type { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { isRegistered } from 'src/quests/acceptance/quest-eligibility';

export interface QuestUpdateInput {
    type: QuestType;
    verdicts: { characterId: Types.ObjectId; verdict: QuestOutcome }[];
    now: Date;
}

// regola di gioco (A3, RESEARCH Q4): la quest registrata si conclude se almeno un partecipante vince; ogni fallito libera il posto; una aid si conclude sempre
export function questUpdateOf(
    input: QuestUpdateInput,
): Record<string, unknown> | null {
    if (!isRegistered(input.type)) return null;
    const failed = input.verdicts
        .filter(({ verdict }) => verdict === QuestOutcome.failure)
        .map(({ characterId }) => characterId);
    const someoneWon = input.verdicts.some(
        ({ verdict }) =>
            verdict === QuestOutcome.success ||
            verdict === QuestOutcome.gmCompleted,
    );
    const concludes = input.type === QuestType.aid || someoneWon;
    const update = {
        ...(failed.length > 0
            ? {
                  $pull: {
                      registeredAdventurers: { character: { $in: failed } },
                  },
              }
            : {}),
        ...(concludes ? { $set: { concludedAt: input.now } } : {}),
    };
    return Object.keys(update).length > 0 ? update : null;
}

// claim del gruppo (D-05, D-21): la scrittura della Quest nella stessa transazione esclude un secondo trigger (WriteConflict)
export function questClaimFilter(
    questId: Types.ObjectId,
    participantIds: Types.ObjectId[] | null,
): Record<string, unknown> {
    return {
        _id: questId,
        concludedAt: null,
        ...(participantIds
            ? { 'registeredAdventurers.character': { $all: participantIds } }
            : {}),
    };
}
