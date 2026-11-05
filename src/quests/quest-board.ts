// tabellone per area (13.1 D-05): POI della città del personaggio + story del suo titolo + le sue corsie;
// il filtro è puro, le letture stanno in QuestsService
import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { QUEST_LANES, lanePathOf } from './acceptance/quest-lanes';

export interface BoardScope {
    poiIds: readonly Types.ObjectId[];
    title: unknown;
    laneQuestIds: readonly Types.ObjectId[];
}

export interface BoardCity {
    markerLocation?: unknown;
    pointsOfInterest?: readonly unknown[] | null;
}

export const BOARD_CHARACTER_PROJECTION: Readonly<Record<string, 1>> = {
    'status.location': 1,
    'status.title': 1,
    ...Object.fromEntries(QUEST_LANES.map((lane) => [lanePathOf(lane), 1])),
};

// stessa regola dell'accettazione (07 D-10) senza la clausola sul marker della quest
export function cityOfLocationFilter(location: Types.ObjectId) {
    return {
        $or: [
            { markerLocation: { $in: idForms(location) } },
            { pointsOfInterest: location },
        ],
    };
}

// il marker non è elencato per tutte le città: aggiunto in testa, dedup per esadecimale
export function cityPoiIdsOf(city: BoardCity): Types.ObjectId[] {
    return uniqueIdsOf([city.markerLocation, ...(city.pointsOfInterest ?? [])]);
}

export function laneQuestIdsOf(
    pendingQuests: readonly { quest?: unknown }[],
): Types.ObjectId[] {
    return refIdsOf(pendingQuests.map((pendingQuest) => pendingQuest.quest));
}

// ramo story solo con un titolo stringa: un minTitle undefined farebbe passare ogni story (13.1 D-05)
export function boardFilterOf(scope: BoardScope) {
    return {
        concludedAt: null,
        $or: [
            { 'infos.markerLocation': { $in: scope.poiIds.flatMap(idForms) } },
            ...(typeof scope.title === 'string'
                ? [
                      {
                          'infos.type': QuestType.story,
                          'requirements.minTitle': scope.title,
                      },
                  ]
                : []),
            { _id: { $in: [...scope.laneQuestIds] } },
        ],
    };
}

function refIdsOf(values: readonly unknown[]): Types.ObjectId[] {
    return values
        .map(refIdOf)
        .filter((id): id is Types.ObjectId => id !== null);
}

function uniqueIdsOf(values: readonly unknown[]): Types.ObjectId[] {
    const seen = new Set<string>();
    return refIdsOf(values).filter((id) => {
        const hex = id.toHexString();
        if (seen.has(hex)) return false;
        seen.add(hex);
        return true;
    });
}
