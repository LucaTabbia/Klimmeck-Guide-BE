import { InjuryType } from 'src/models/enums/injury-type.enum';
import { cureInjuries } from 'src/quests/outcomes/injuries/cure-injuries';

const { deepCut, infection, sprain, frostbite } = InjuryType;

describe('cureInjuries', () => {
    it('removes the injuries listed in canHeal and reports them as healed (D-13)', () => {
        expect(
            cureInjuries([deepCut, infection, sprain], [infection, deepCut]),
        ).toEqual({ injuries: [sprain], healed: [deepCut, infection] });
    });

    it('keeps the order of the character injuries in both lists (D-08)', () => {
        expect(
            cureInjuries(
                [sprain, frostbite, deepCut, infection],
                [deepCut, sprain],
            ),
        ).toEqual({
            injuries: [frostbite, infection],
            healed: [sprain, deepCut],
        });
    });

    it('reports a duplicated injury once and removes every copy (D-13)', () => {
        expect(cureInjuries([deepCut, deepCut, sprain], [deepCut])).toEqual({
            injuries: [sprain],
            healed: [deepCut],
        });
    });

    it('ignores the unknown entries of canHeal (D-13)', () => {
        expect(
            cureInjuries([deepCut, sprain], ['brokenWing', 42, null, deepCut]),
        ).toEqual({ injuries: [sprain], healed: [deepCut] });
    });

    it('leaves a legacy unknown injury of the character where it is (D-13)', () => {
        const legacy = 'oldWound' as InjuryType;

        expect(cureInjuries([legacy, deepCut], ['oldWound', deepCut])).toEqual({
            injuries: [legacy],
            healed: [deepCut],
        });
    });

    it('heals nothing with an empty canHeal (D-01)', () => {
        expect(cureInjuries([deepCut], [])).toEqual({
            injuries: [deepCut],
            healed: [],
        });
    });

    it('never mutates its inputs (D-13)', () => {
        const injuries = Object.freeze([deepCut, sprain, infection]);
        const canHeal = Object.freeze([sprain]);

        const result = cureInjuries(injuries, canHeal);

        expect(result.injuries).not.toBe(injuries);
        expect(result).toEqual({
            injuries: [deepCut, infection],
            healed: [sprain],
        });
        expect(injuries).toEqual([deepCut, sprain, infection]);
        expect(canHeal).toEqual([sprain]);
    });
});
