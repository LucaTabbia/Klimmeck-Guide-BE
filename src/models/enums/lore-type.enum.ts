import { registerEnumType } from "@nestjs/graphql";


export enum LoreType {
    enemy,
    animal,
    plant,
    character,
    city,
    region,
    state,
    religion,
    ceremony,
    god,
    material,
    knowledge,
}

registerEnumType(LoreType, { name: 'LoreType' });
