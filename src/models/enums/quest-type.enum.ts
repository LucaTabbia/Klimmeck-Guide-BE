import { registerEnumType } from "@nestjs/graphql";

export enum QuestType {
    hunt,
    aid,
    enemy,
    worldMission,
    boss,
    dungeon,
    story,
    study,
    heal,
    job,
    crime,
    guard
}

registerEnumType(QuestType, { name: 'QuestType' });

