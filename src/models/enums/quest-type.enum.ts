import { registerEnumType } from '@nestjs/graphql';

export enum QuestType {
    hunt = 'hunt',
    aid = 'aid',
    enemy = 'enemy',
    worldMission = 'worldMission',
    boss = 'boss',
    dungeon = 'dungeon',
    story = 'story',
    study = 'study',
    magic = 'magic',
    heal = 'heal',
    job = 'job',
    crime = 'crime',
    guard = 'guard',
}

registerEnumType(QuestType, { name: 'QuestType' });
