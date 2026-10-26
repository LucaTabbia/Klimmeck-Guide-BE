import { InjuryEffect } from 'src/models/enums/injury-effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import {
    EFFECT_MODIFIERS,
    INJURY_EFFECTS,
    MIN_INJURY_FACTOR,
    injuryModifiersOf,
    travelSpeedFactorOf,
} from 'src/quests/outcomes/injuries/injury-rules';

const NEUTRAL = { damageFactor: 1, lifePointsFactor: 1, speedFactor: 1 };

describe('injury tables', () => {
    it.each(Object.values(InjuryType))(
        'maps %s to at least one known effect',
        (injury) => {
            const effects = INJURY_EFFECTS[injury];

            expect(effects.length).toBeGreaterThan(0);
            effects.forEach((effect) =>
                expect(Object.values(InjuryEffect)).toContain(effect),
            );
        },
    );

    it.each(Object.values(InjuryEffect))(
        'gives %s factors within (0, 1]',
        (effect) => {
            Object.values(EFFECT_MODIFIERS[effect]).forEach((factor) => {
                expect(factor).toBeGreaterThan(0);
                expect(factor).toBeLessThanOrEqual(1);
            });
        },
    );
});

describe('injuryModifiersOf', () => {
    it('is neutral without injuries', () => {
        expect(injuryModifiersOf([])).toEqual(NEUTRAL);
        expect(injuryModifiersOf(null)).toEqual(NEUTRAL);
    });

    it('multiplies the factors of every effect of an injury', () => {
        const modifiers = injuryModifiersOf(['brokenLeftLeg']);

        expect(modifiers.speedFactor).toBeCloseTo(0.8, 6);
        expect(modifiers.damageFactor).toBeCloseTo(0.95, 6);
        expect(modifiers.lifePointsFactor).toBe(1);
    });

    it('never lets a factor fall below the floor', () => {
        const modifiers = injuryModifiersOf(Object.values(InjuryType));

        Object.values(modifiers).forEach((factor) =>
            expect(factor).toBeGreaterThanOrEqual(MIN_INJURY_FACTOR),
        );
        expect(MIN_INJURY_FACTOR).toBe(0.1);
    });
});

describe('travelSpeedFactorOf', () => {
    it('stacks the movement impairment of different injuries', () => {
        expect(
            travelSpeedFactorOf(['missingLeftLeg', 'missingRightLeg']),
        ).toBeCloseTo(0.64, 6);
    });

    it('counts a repeated injury once', () => {
        expect(
            travelSpeedFactorOf(['brokenLeftLeg', 'brokenLeftLeg']),
        ).toBeCloseTo(0.8, 6);
    });

    it('ignores injuries without movement impairment', () => {
        expect(travelSpeedFactorOf(['blackEye'])).toBe(1);
    });

    it('ignores unknown legacy strings', () => {
        expect(travelSpeedFactorOf(['legacyUnknown'])).toBe(1);
    });
});
