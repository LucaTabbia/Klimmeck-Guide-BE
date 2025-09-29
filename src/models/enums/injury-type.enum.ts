import { registerEnumType } from "@nestjs/graphql";

export enum InjuryType {
    headConcussion = "headConcussion",
    traumaticBrainInjury = "traumaticBrainInjury",
    missingLeftEye = "missingLeftEye",
    missingRightEye = "missingRightEye",
    blindness = "blindness",
    blackEye = "blackEye",
    missingLeftArm = "missingLeftArm",
    missingRightArm = "missingRightArm",
    brokenLeftArm = "brokenLeftArm",
    brokenRightArm = "brokenRightArm",
    crushedLeftHand = "crushedLeftHand",
    crushedRightHand = "crushedRightHand",
    missingRightHand = "missingRightHand",
    missingLeftHand = "missingLeftHand",
    missingLeftLeg = "missingLeftLeg",
    missingRightLeg = "missingRightLeg",
    brokenLeftLeg = "brokenLeftLeg",
    brokenRightLeg = "brokenRightLeg",
    fracturedRib = "fracturedRib",
    puncturedLung = "puncturedLung",
    deepCut = "deepCut",
    severeBurn = "severeBurn",
    poisonInjection = "poisonInjection",
    paralysis = "paralysis",
    internalBleeding = "internalBleeding",
    frostbite = "frostbite",
    infection = "infection",
    spinalInjury = "spinalInjury",
}

registerEnumType(InjuryType, { name: 'InjuryType' });
