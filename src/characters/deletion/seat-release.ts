import { Types } from 'mongoose';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import { idForms } from 'src/mongo/document-id';
import { registeredIdsOf } from 'src/quests/party/party-rules';

const seatOf = (characterId: Types.ObjectId) => ({
    $in: idForms(characterId),
});

// prima dell'avvio il posto torna libero come in Phase 8 D-30 (anche story e worldMission, che non partono mai)
export function unstartedSeatReleaseOf(
    questIds: Types.ObjectId[],
    characterId: Types.ObjectId,
) {
    return {
        filter: { _id: { $in: questIds }, startedAt: null },
        update: {
            $pull: {
                registeredAdventurers: { character: seatOf(characterId) },
            },
        },
    };
}

// dopo l'avvio la registrazione resta come segnaposto (D-06): il marcatore è una scrittura reale,
// così due archivi concorrenti vanno in conflitto e il change stream emette la quest (D-07)
export function placeholderMarkOf(
    questIds: Types.ObjectId[],
    characterId: Types.ObjectId,
    now: Date,
) {
    return {
        filter: {
            _id: { $in: questIds },
            concludedAt: null,
            startedAt: { $ne: null },
        },
        update: { $set: { 'registeredAdventurers.$[seat].archivedAt': now } },
        arrayFilters: [{ 'seat.character': seatOf(characterId) }],
    };
}

// nessun partecipante reale: la quest torna non avviata e un nuovo party può formarsi (estende la regola del roster vuoto)
export function startedQuestResetOf(questId: Types.ObjectId) {
    return {
        filter: { _id: questId, concludedAt: null, startedAt: { $ne: null } },
        update: { $set: { startedAt: null, registeredAdventurers: [] } },
    };
}

// chi è reale lo dice la collection dei personaggi, non il marcatore: registrazioni legacy o con id pendenti non lo hanno
export function activeRegistrantFilterOf(
    registrations: readonly { character?: unknown }[],
) {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        _id: {
            $in: registeredIdsOf(registrations).flatMap((id) => idForms(id)),
        },
    };
}
