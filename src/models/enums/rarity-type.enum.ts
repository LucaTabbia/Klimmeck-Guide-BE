import { registerEnumType } from "@nestjs/graphql";

export enum RarityType {
    common = "common",
    uncommon = "uncommon",
    rare = "rare",
    ultrarare = "ultrarare",
    legendary = "legendary",
}

registerEnumType(RarityType, { name: 'RarityType' });
