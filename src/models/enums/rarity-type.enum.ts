import { registerEnumType } from "@nestjs/graphql";

export enum RarityType {
    common,
    uncommon,
    rare,
    ultrarare,
    legendary
}

registerEnumType(RarityType, { name: 'RarityType' });
