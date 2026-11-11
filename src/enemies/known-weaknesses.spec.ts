import { knownDamageTypesOf, knownEnergyTypesOf } from './known-weaknesses';

describe('known weaknesses', () => {
    it('keeps the values of the enum in the stored order (D-01)', () => {
        expect(knownDamageTypesOf(['pierce', 'cut'])).toEqual([
            'pierce',
            'cut',
        ]);
        expect(knownEnergyTypesOf(['fire', 'acid'])).toEqual(['fire', 'acid']);
    });

    it('drops every value outside the enum (D-01)', () => {
        expect(knownDamageTypesOf(['tickle', 'cut', 7, null])).toEqual(['cut']);
        expect(knownEnergyTypesOf(['cut', 'fire', 'toString'])).toEqual([
            'fire',
        ]);
    });

    it('reads an absent or null list as empty (D-01)', () => {
        expect(knownDamageTypesOf(undefined)).toEqual([]);
        expect(knownEnergyTypesOf(null)).toEqual([]);
    });
});
