import { registerEnumType } from "@nestjs/graphql";

export enum ClassType {
    barbarian,
    bard,
    cleric,
    druid,
    fighter,
    monk,
    paladin,
    ranger,
    rogue,
    sorcerer,
    warlock,
    wizard,
}

registerEnumType(ClassType, { name: 'ClassType' });
