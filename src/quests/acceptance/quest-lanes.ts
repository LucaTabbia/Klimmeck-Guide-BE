import { QuestType } from 'src/models/enums/quest-type.enum';
import { refIdOf } from 'src/mongo/document-id';

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

// solo le corsie che il GM completa a mano (D-22): la standard si risolve da sola alla scadenza
export type GmLane = QuestLane.story | QuestLane.worldMission;

export const GM_LANES: readonly GmLane[] = [
    QuestLane.story,
    QuestLane.worldMission,
];

export const isGmLane = (lane: QuestLane): lane is GmLane =>
    (GM_LANES as readonly QuestLane[]).includes(lane);

export type QuestLanePath = `quests.${QuestLane}`;

export function laneOf(type: QuestType): QuestLane {
    if (type === QuestType.story) return QuestLane.story;
    if (type === QuestType.worldMission) return QuestLane.worldMission;
    return QuestLane.standard;
}

export function lanePathOf(lane: QuestLane): QuestLanePath {
    return `quests.${lane}`;
}

// la corsia standard libera (D-17 Phase 8, D-24): teleport, avvio del viaggio e completamento del GM leggono la stessa regola
export const STANDARD_LANE_FREE = { 'quests.pendingQuest': null } as const;

// gemello in memoria del predicato: un id salvato in qualunque forma rende la corsia occupata
export function isStandardLaneBusy(
    quests: { pendingQuest?: unknown } | null | undefined,
): boolean {
    return refIdOf(quests?.pendingQuest) !== null;
}
