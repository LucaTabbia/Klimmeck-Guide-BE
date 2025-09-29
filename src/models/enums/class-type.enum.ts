import { registerEnumType } from "@nestjs/graphql";

export enum ClassType {
    barbarian = "barbarian",
    bard = "bard",
    cleric = "cleric",
    druid = "druid",
    fighter = "fighter",
    monk = "monk",
    paladin = "paladin",
    ranger = "ranger",
    rogue = "rogue",
    sorcerer = "sorcerer",
    warlock = "warlock",
    wizard = "wizard",
}

registerEnumType(ClassType, { name: 'ClassType' });
