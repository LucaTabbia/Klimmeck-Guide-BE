import { registerEnumType } from "@nestjs/graphql";

export enum DamageType {
    blunt,
    cut,
    pierce
}

registerEnumType(DamageType, { name: 'DamageType' });
