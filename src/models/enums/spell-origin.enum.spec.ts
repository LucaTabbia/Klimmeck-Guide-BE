import { SpellOrigin } from './spell-origin.enum';

describe('SpellOrigin', () => {
    it('pins the three spell origins on the wire values (D-01)', () => {
        expect(Object.values(SpellOrigin)).toEqual([
            'void',
            'arcane',
            'shamanic',
        ]);
    });

    it('spells the arcane origin as arcane, never as the old magic name (D-01)', () => {
        expect(SpellOrigin.arcane).toBe('arcane');
        expect(Object.values(SpellOrigin)).not.toContain('magic');
    });
});
