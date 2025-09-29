import { registerEnumType } from "@nestjs/graphql";

export enum EffectType {
    none = "none",
    heal = "heal",
    hunger = "hunger",
    munition = "munition",
    exploration = "exploration",
}

registerEnumType(EffectType, { name: 'EffectType' });
