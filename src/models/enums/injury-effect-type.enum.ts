import { registerEnumType } from "@nestjs/graphql";

export enum InjuryEffect {
    movementImpairment = "movementImpairment",
    visionLoss = "visionLoss",
    bleeding = "bleeding",
    pain = "pain",
    paralysis = "paralysis",
    infection = "infection",
    consciousnessLoss = "consciousnessLoss",
    staminaDrain = "staminaDrain",
    poisoned = "poisoned",
    burned = "burned",
}

registerEnumType(InjuryEffect, { name: 'InjuryEffect' });
