import { registerEnumType } from "@nestjs/graphql";

export enum InjuryEffect {
    movementImpairment,
    visionLoss,
    bleeding,
    pain,
    paralysis,
    infection,
    consciousnessLoss,
    staminaDrain,
    poisoned,
    burned
}

registerEnumType(InjuryEffect, { name: 'InjuryEffect' });
