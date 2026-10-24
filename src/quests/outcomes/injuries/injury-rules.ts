// SEGNAPOSTO (D-02, D-15): le regole delle ferite sono dell'utente e arriveranno in seguito; ogni malus delle ferite vive solo in questo file
import { InjuryEffect } from 'src/models/enums/injury-effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';

export interface InjuryModifiers {
    damageFactor: number;
    lifePointsFactor: number;
    speedFactor: number;
}

const {
    movementImpairment,
    visionLoss,
    bleeding,
    pain,
    paralysis,
    infection,
    consciousnessLoss,
    staminaDrain,
    poisoned,
    burned,
} = InjuryEffect;

// valori provvisori (D-02)
export const INJURY_EFFECTS: Readonly<
    Record<InjuryType, readonly InjuryEffect[]>
> = {
    [InjuryType.headConcussion]: [consciousnessLoss, pain],
    [InjuryType.traumaticBrainInjury]: [consciousnessLoss, paralysis],
    [InjuryType.missingLeftEye]: [visionLoss],
    [InjuryType.missingRightEye]: [visionLoss],
    [InjuryType.blindness]: [visionLoss],
    [InjuryType.blackEye]: [visionLoss, pain],
    [InjuryType.missingLeftArm]: [pain],
    [InjuryType.missingRightArm]: [pain],
    [InjuryType.brokenLeftArm]: [pain],
    [InjuryType.brokenRightArm]: [pain],
    [InjuryType.crushedLeftHand]: [pain],
    [InjuryType.crushedRightHand]: [pain],
    [InjuryType.missingRightHand]: [pain],
    [InjuryType.missingLeftHand]: [pain],
    [InjuryType.missingLeftLeg]: [movementImpairment],
    [InjuryType.missingRightLeg]: [movementImpairment],
    [InjuryType.brokenLeftLeg]: [movementImpairment, pain],
    [InjuryType.brokenRightLeg]: [movementImpairment, pain],
    [InjuryType.fracturedRib]: [pain, staminaDrain],
    [InjuryType.puncturedLung]: [staminaDrain, bleeding],
    [InjuryType.deepCut]: [bleeding],
    [InjuryType.severeBurn]: [burned, pain],
    [InjuryType.poisonInjection]: [poisoned],
    [InjuryType.paralysis]: [paralysis, movementImpairment],
    [InjuryType.internalBleeding]: [bleeding, staminaDrain],
    [InjuryType.frostbite]: [pain, movementImpairment],
    [InjuryType.infection]: [infection],
    [InjuryType.spinalInjury]: [paralysis, movementImpairment],
};

const modifiers = (
    damageFactor: number,
    lifePointsFactor: number,
    speedFactor: number,
): InjuryModifiers => ({ damageFactor, lifePointsFactor, speedFactor });

// fattori provvisori (D-02): damage, lifePoints, speed
export const EFFECT_MODIFIERS: Readonly<Record<InjuryEffect, InjuryModifiers>> =
    {
        movementImpairment: modifiers(1, 1, 0.8),
        visionLoss: modifiers(0.9, 1, 1),
        bleeding: modifiers(1, 0.9, 1),
        pain: modifiers(0.95, 1, 1),
        paralysis: modifiers(0.8, 1, 0.9),
        infection: modifiers(1, 0.95, 1),
        consciousnessLoss: modifiers(0.9, 1, 1),
        staminaDrain: modifiers(0.95, 0.95, 1),
        poisoned: modifiers(1, 0.9, 1),
        burned: modifiers(0.95, 0.95, 1),
    };

// nessun malus azzera danni o velocità (T-09-16)
export const MIN_INJURY_FACTOR = 0.1;

const KNOWN_INJURIES: ReadonlySet<unknown> = new Set(Object.values(InjuryType));

const isInjuryType = (value: unknown): value is InjuryType =>
    KNOWN_INJURIES.has(value);

// ogni ferita conta una volta; le stringhe legacy ignote sono ignorate
export function injuryModifiersOf(
    injuries: readonly unknown[] | null | undefined,
): InjuryModifiers {
    const effects = [...new Set(injuries ?? [])]
        .filter(isInjuryType)
        .flatMap((injury) => INJURY_EFFECTS[injury])
        .map((effect) => EFFECT_MODIFIERS[effect]);
    const product = (factor: keyof InjuryModifiers): number =>
        Math.max(
            MIN_INJURY_FACTOR,
            effects.reduce((total, effect) => total * effect[factor], 1),
        );
    return modifiers(
        product('damageFactor'),
        product('lifePointsFactor'),
        product('speedFactor'),
    );
}

// fotografato alla partenza come il pet (D-15, Phase 8 D-09)
export function travelSpeedFactorOf(
    injuries: readonly unknown[] | null | undefined,
): number {
    return injuryModifiersOf(injuries).speedFactor;
}
