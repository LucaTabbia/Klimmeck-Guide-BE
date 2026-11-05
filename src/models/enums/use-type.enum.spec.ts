import { UseType } from './use-type.enum';

describe('UseType', () => {
    it('pins the use types of the spells, heal included (quick 251105)', () => {
        expect(Object.values(UseType)).toEqual([
            'defense',
            'attack',
            'control',
            'illusion',
            'charm',
            'confuse',
            'enhance',
            'infuse',
            'heal',
        ]);
    });

    it('spells the heal use type as its own value (quick 251105)', () => {
        expect(UseType.heal).toBe('heal');
    });
});
