import { registerEnumType } from "@nestjs/graphql";


export enum InjuryType {
    headConcussion,
    traumaticBrainInjury,
    missingLeftEye,
    missingRightEye,
    blindness,
    blackEye,
    missingLeftArm,
    missingRightArm,
    brokenLeftArm,
    brokenRightArm,
    crushedLeftHand,
    crushedRightHand,
    missingRightHand,
    missingLeftHand,
    missingLeftLeg,
    missingRightLeg,
    brokenLeftLeg,
    brokenRightLeg,
    fracturedRib,
    puncturedLung,
    deepCut,
    severeBurn,
    poisonInjection,
    paralysis,
    internalBleeding,
    frostbite,
    infection,
    spinalInjury
}

registerEnumType(InjuryType, { name: 'InjuryType' });

