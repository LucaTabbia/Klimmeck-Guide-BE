import type { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { isRegistered } from 'src/quests/acceptance/quest-eligibility';

export interface QuestUpdateInput {
    type: QuestType;
    verdicts: { characterId: Types.ObjectId; verdict: QuestOutcome }[];
    dropped?: readonly Types.ObjectId[];
    now: Date;
}

// regola di gioco (A3, utente 2026-10-25): il verdetto di un combattimento è unico per chi combatte insieme, quindi la quest registrata si conclude se il combattimento è vinto (o se il GM la completa); ogni fallito libera il posto; una aid si conclude sempre
export function questUpdateOf(
    input: QuestUpdateInput,
): Record<string, unknown> | null {
    if (!isRegistered(input.type)) return null;
    // un registrato incoerente esce insieme ai falliti: un difetto di dati non blocca il gruppo (Pitfall 8)
    const failed = [
        ...input.verdicts
            .filter(({ verdict }) => verdict === QuestOutcome.failure)
            .map(({ characterId }) => characterId),
        ...(input.dropped ?? []),
    ];
    const won = input.verdicts.some(
        ({ verdict }) =>
            verdict === QuestOutcome.success ||
            verdict === QuestOutcome.gmCompleted,
    );
    const concludes = input.type === QuestType.aid || won;
    const update = {
        ...(failed.length > 0
            ? {
                  $pull: {
                      registeredAdventurers: { character: { $in: failed } },
                  },
              }
            : {}),
        ...(concludes ? { $set: { concludedAt: input.now } } : {}),
        // fallimento senza conclusione: la quest torna non avviata, un nuovo party può formarsi (utente 2026-10-25)
        ...(!concludes && failed.length > 0
            ? { $set: { startedAt: null } }
            : {}),
    };
    return Object.keys(update).length > 0 ? update : null;
}

// claim del gruppo (boss D-05, soccorso di gruppo D-09; D-21): la scrittura della Quest nella stessa transazione esclude un secondo trigger (WriteConflict)
export function questClaimFilter(
    questId: Types.ObjectId,
    participantIds: readonly Types.ObjectId[] | null,
): Record<string, unknown> {
    return {
        _id: questId,
        concludedAt: null,
        ...(participantIds
            ? {
                  'registeredAdventurers.character': {
                      $all: [...participantIds],
                  },
              }
            : {}),
    };
}
