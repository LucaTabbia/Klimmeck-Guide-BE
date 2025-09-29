import { registerEnumType } from "@nestjs/graphql";

export enum QuestType {
    hunt = "hunt",
    aid = "aid",
    enemy = "enemy",
    worldMission = "worldMission",
    boss = "boss",
    dungeon = "dungeon",
    story = "story",
    study = "study",
    heal = "heal",
    job = "job",
    crime = "crime",
    guard = "guard",
}

registerEnumType(QuestType, { name: 'QuestType' });
