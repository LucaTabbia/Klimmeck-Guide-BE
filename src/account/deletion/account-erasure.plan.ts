import { Types } from 'mongoose';
import { idForms, isObjectId, refIdOf } from 'src/mongo/document-id';
import { QUEST_LANES } from 'src/quests/acceptance/quest-lanes';

function distinctIds(ids: readonly Types.ObjectId[]): Types.ObjectId[] {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const hex = id.toHexString();
        if (seen.has(hex)) return false;
        seen.add(hex);
        return true;
    });
}

const formsOf = (characterIds: readonly Types.ObjectId[]) => ({
    $in: characterIds.flatMap((id) => idForms(id)),
});

// il corrente creato prima della fase non ha il proprietario (Phase 26 D-24): si unisce ai posseduti
export function erasedCharacterIdsOf(
    currentCharacter: unknown,
    owned: readonly { _id: Types.ObjectId }[],
): Types.ObjectId[] {
    const current = refIdOf(currentCharacter);
    return distinctIds([
        ...owned.map(({ _id }) => _id),
        ...(current ? [current] : []),
    ]);
}

// la standard l'archivio la lascia sul personaggio: senza di lui resterebbe orfana per sempre (D-14, Pitfall 2)
export function laneRequestIdsOf(
    characters: readonly { quests?: Record<string, unknown> | null }[],
): Types.ObjectId[] {
    return distinctIds(
        characters
            .flatMap(({ quests }) =>
                QUEST_LANES.map((lane) => refIdOf(quests?.[lane])),
            )
            .filter(isObjectId),
    );
}

// la revisione incrementata annulla un completamento guidato in volo (B-01); il nome fotografato esce col partecipante
export function missionDraftCleanupOf(characterIds: readonly Types.ObjectId[]) {
    const ids = { $in: [...characterIds] };
    return {
        filter: {
            $or: [
                { 'participants.character': ids },
                { 'prizes.character': ids },
                { 'backgroundAdditions.character': ids },
                { 'fights.outcomes.character': ids },
            ],
        },
        update: {
            $pull: {
                participants: { character: ids },
                prizes: { character: ids },
                backgroundAdditions: { character: ids },
                'fights.$[].outcomes': { character: ids },
            },
            $inc: { rev: 1 },
        },
    };
}

export const EMPTY_MISSION_DRAFT_FILTER: Record<string, unknown> = {
    participants: { $size: 0 },
};

// quest e aid concluse ancora con i personaggi dell'utente (Phase 26 D-14): la conclusione e l'archivio li lasciano
export function concludedQuestCleanupOf(
    characterIds: readonly Types.ObjectId[],
) {
    const forms = formsOf(characterIds);
    return {
        seats: {
            filter: {
                concludedAt: { $ne: null },
                'registeredAdventurers.character': forms,
            },
            update: { $pull: { registeredAdventurers: { character: forms } } },
        },
        wounded: {
            filter: {
                concludedAt: { $ne: null },
                'rescue.characters': forms,
            },
            update: { $pull: { 'rescue.characters': forms } },
        },
    };
}

// quest non avviate e aid aperte dopo l'archivio (WR-04): il cast del modello nell'archivio non vede la forma stringa dell'id
export function openQuestCleanupOf(characterIds: readonly Types.ObjectId[]) {
    const forms = formsOf(characterIds);
    return {
        seats: {
            filter: {
                concludedAt: null,
                startedAt: null,
                'registeredAdventurers.character': forms,
            },
            update: { $pull: { registeredAdventurers: { character: forms } } },
        },
        wounded: {
            filter: { concludedAt: null, 'rescue.characters': forms },
            update: { $pull: { 'rescue.characters': forms } },
        },
    };
}

export const EMPTIED_OPEN_AID_FILTER: Record<string, unknown> = {
    concludedAt: null,
    'rescue.characters': { $size: 0 },
};

// il foglio altrui conta chi ha salvato: un id anonimo prende il posto del cancellato e il conteggio resta (D-14)
export function rescuedCountKeeperOf(
    characterIds: readonly Types.ObjectId[],
    anonymousId: Types.ObjectId,
) {
    const forms = formsOf(characterIds);
    return {
        filter: { rescuedCharacters: forms },
        update: { $set: { 'rescuedCharacters.$[erased]': anonymousId } },
        arrayFilters: [{ erased: forms }],
    };
}
