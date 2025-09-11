import { registerEnumType } from "@nestjs/graphql";


export enum RaceType { dragonborn, elf, gnome, halfling, halfelf, human, dwarf, tiefling, aarakocra }

registerEnumType(RaceType, { name: 'RaceType' });

