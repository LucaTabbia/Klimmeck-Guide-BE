import { registerEnumType } from "@nestjs/graphql";

export enum RaceType {
    dragonborn = "dragonborn",
    elf = "elf",
    gnome = "gnome",
    halfling = "halfling",
    halfelf = "halfelf",
    human = "human",
    dwarf = "dwarf",
    tiefling = "tiefling",
    aarakocra = "aarakocra",
}

registerEnumType(RaceType, { name: 'RaceType' });
