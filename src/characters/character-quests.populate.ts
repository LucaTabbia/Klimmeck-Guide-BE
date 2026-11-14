import type { PopulateOptions } from 'mongoose';
import { PendingQuest } from 'src/models/pending-quest.model';
import { Quest } from 'src/models/quest/quest.model';
import { lanePathOf, QUEST_LANES } from 'src/quests/acceptance/quest-lanes';

// ref non popolati = ObjectId di bson, il cui `id` è il Buffer: della quest solo l'_id e il tipo, il resto il FE lo risolve dalla board (D-13, C2);
// il tipo serve alla pedina per dire cosa sta facendo il personaggio (utente 2026-11-14)
const QUEST_ID_AND_TYPE: PopulateOptions = {
    path: 'quest',
    model: Quest.name,
    select: '_id infos.type',
};

export const CHARACTER_QUESTS_POPULATE: PopulateOptions[] = [
    ...QUEST_LANES.map((lane) => ({
        path: lanePathOf(lane),
        model: PendingQuest.name,
        populate: QUEST_ID_AND_TYPE,
    })),
    { path: 'quests.completedQuests', model: Quest.name, select: '_id' },
];
