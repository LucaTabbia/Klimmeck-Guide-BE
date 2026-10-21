import type { PopulateOptions } from 'mongoose';
import { PendingQuest } from 'src/models/pending-quest.model';
import { Quest } from 'src/models/quest/quest.model';
import { lanePathOf, QUEST_LANES } from 'src/quests/acceptance/quest-lanes';

// ref non popolati = ObjectId di bson, il cui `id` è il Buffer: solo l'_id della quest, il FE la risolve dalla board (D-13, C2)
const QUEST_ID_ONLY: PopulateOptions = {
    path: 'quest',
    model: Quest.name,
    select: '_id',
};

export const CHARACTER_QUESTS_POPULATE: PopulateOptions[] = [
    ...QUEST_LANES.map((lane) => ({
        path: lanePathOf(lane),
        model: PendingQuest.name,
        populate: QUEST_ID_ONLY,
    })),
    { path: 'quests.completedQuests', model: Quest.name, select: '_id' },
];
