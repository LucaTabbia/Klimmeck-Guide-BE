import { registerEnumType } from "@nestjs/graphql";

export enum RaceType {
    dragonborn = "dragonborn",
    elf = "elf",
    gnome = "gnome",
    halfling = "halfling",
    halfelf = "halfelf",
    human = "human",
    dwarf = "dwarf",
    infernal = "infernal",
    volucri = "volucri",
}

registerEnumType(RaceType, { name: 'RaceType' });
