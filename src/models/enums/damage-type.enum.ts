import { registerEnumType } from "@nestjs/graphql";

export enum DamageType {
    blunt = "blunt",
    cut = "cut",
    pierce = "pierce",
}

registerEnumType(DamageType, { name: 'DamageType' });
