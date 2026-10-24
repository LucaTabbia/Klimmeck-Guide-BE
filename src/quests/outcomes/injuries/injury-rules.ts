import { InjuryEffect } from 'src/models/enums/injury-effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';

export interface InjuryModifiers {
    damageFactor: number;
    lifePointsFactor: number;
    speedFactor: number;
}

export const INJURY_EFFECTS = {} as Readonly<
    Record<InjuryType, readonly InjuryEffect[]>
>;

export const EFFECT_MODIFIERS = {} as Readonly<
    Record<InjuryEffect, InjuryModifiers>
>;

export const MIN_INJURY_FACTOR = 0;

export function injuryModifiersOf(
    injuries: readonly unknown[] | null | undefined,
): InjuryModifiers {
    void injuries;
    return { damageFactor: 0, lifePointsFactor: 0, speedFactor: 0 };
}

export function travelSpeedFactorOf(
    injuries: readonly unknown[] | null | undefined,
): number {
    void injuries;
    return 0;
}
