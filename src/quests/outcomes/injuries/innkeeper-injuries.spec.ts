import { InjuryType } from 'src/models/enums/injury-type.enum';
import {
    innkeeperInjuriesOf,
    type WoundStatus,
} from 'src/quests/outcomes/injuries/innkeeper-injuries';

const { deepCut, infection, sprain, frostbite } = InjuryType;

describe('innkeeperInjuriesOf', () => {
    it.each<[string, WoundStatus]>([
        ['absent', { injuries: [deepCut] }],
        ['null', { injuries: [deepCut], innkeeperInjuries: null }],
        ['absent with no wounds at all', {}],
    ])(
        'reads no innkeeper wound when the field is missing: %s (D-16)',
        (_label, status) => {
            expect(innkeeperInjuriesOf(status)).toEqual([]);
        },
    );

    it('keeps only the wounds the character carries (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: [deepCut, infection],
                innkeeperInjuries: [infection, sprain],
            }),
        ).toEqual([infection]);
    });

    it('reads a duplicated innkeeper wound once (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: [deepCut],
                innkeeperInjuries: [deepCut, deepCut],
            }),
        ).toEqual([deepCut]);
    });

    it('drops an unknown wound type (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: ['oldWound', deepCut, 42, null],
                innkeeperInjuries: ['oldWound', 42, null, deepCut],
            }),
        ).toEqual([deepCut]);
    });

    it('keeps the order of the innkeeper list (D-16)', () => {
        expect(
            innkeeperInjuriesOf({
                injuries: [deepCut, infection, sprain, frostbite],
                innkeeperInjuries: [frostbite, deepCut, sprain],
            }),
        ).toEqual([frostbite, deepCut, sprain]);
    });

    it('does not mutate what it reads (D-16)', () => {
        const injuries = Object.freeze([deepCut, sprain]);
        const innkeeperInjuries = Object.freeze([sprain, sprain, infection]);
        const status = Object.freeze({ injuries, innkeeperInjuries });

        const result = innkeeperInjuriesOf(status);

        expect(result).toEqual([sprain]);
        expect(result).not.toBe(innkeeperInjuries);
        expect(injuries).toEqual([deepCut, sprain]);
        expect(innkeeperInjuries).toEqual([sprain, sprain, infection]);
    });
});
