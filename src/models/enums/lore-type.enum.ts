import { registerEnumType } from "@nestjs/graphql";

export enum LoreType {
    enemy = "enemy",
    animal = "animal",
    plant = "plant",
    character = "character",
    city = "city",
    region = "region",
    state = "state",
    religion = "religion",
    ceremony = "ceremony",
    god = "god",
    material = "material",
    knowledge = "knowledge",
}

registerEnumType(LoreType, { name: 'LoreType' });
