import { QuestType } from 'src/models/enums/quest-type.enum';

// il valore è il campo di CharacterQuests: la corsia si deriva solo dal tipo del catalogo, mai dal client (D-01)
export enum QuestLane {
    standard = 'pendingQuest',
    story = 'activeStoryQuest',
    worldMission = 'activeWorldMissionQuest',
}

export const QUEST_LANES: readonly QuestLane[] = [
    QuestLane.standard,
    QuestLane.story,
    QuestLane.worldMission,
];

export type QuestLanePath = `quests.${QuestLane}`;

export function laneOf(type: QuestType): QuestLane {
    if (type === QuestType.story) return QuestLane.story;
    if (type === QuestType.worldMission) return QuestLane.worldMission;
    return QuestLane.standard;
}

export function lanePathOf(lane: QuestLane): QuestLanePath {
    return `quests.${lane}`;
}
