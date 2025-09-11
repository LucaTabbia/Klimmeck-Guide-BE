import { registerEnumType } from "@nestjs/graphql";

export enum EffectType {
    none,
    heal,
    hunger,
    munition,
    exploration
}

registerEnumType(EffectType, { name: 'EffectType' });
