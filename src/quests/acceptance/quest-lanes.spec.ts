import { QuestType } from 'src/models/enums/quest-type.enum';
import { laneOf, lanePathOf, QUEST_LANES, QuestLane } from './quest-lanes';

describe('quest lanes', () => {
    const expectedLanes: Record<QuestType, QuestLane> = {
        [QuestType.story]: QuestLane.story,
        [QuestType.worldMission]: QuestLane.worldMission,
        [QuestType.hunt]: QuestLane.standard,
        [QuestType.aid]: QuestLane.standard,
        [QuestType.enemy]: QuestLane.standard,
        [QuestType.boss]: QuestLane.standard,
        [QuestType.dungeon]: QuestLane.standard,
        [QuestType.study]: QuestLane.standard,
        [QuestType.heal]: QuestLane.standard,
        [QuestType.job]: QuestLane.standard,
        [QuestType.crime]: QuestLane.standard,
        [QuestType.guard]: QuestLane.standard,
    };

    it('the lane table covers every QuestType', () => {
        expect(Object.keys(expectedLanes).sort()).toEqual(
            Object.values(QuestType).sort(),
        );
    });

    it.each(Object.entries(expectedLanes))('laneOf(%s) is %s', (type, lane) => {
        expect(laneOf(type as QuestType)).toBe(lane);
    });

    it.each([
        [QuestLane.standard, 'quests.pendingQuest'],
        [QuestLane.story, 'quests.activeStoryQuest'],
        [QuestLane.worldMission, 'quests.activeWorldMissionQuest'],
    ])('lanePathOf(%s) is %s', (lane, path) => {
        expect(lanePathOf(lane)).toBe(path);
    });

    it('lists the three lanes in a fixed order', () => {
        expect(QUEST_LANES).toEqual([
            'pendingQuest',
            'activeStoryQuest',
            'activeWorldMissionQuest',
        ]);
    });
});
