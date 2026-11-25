import { model } from 'mongoose';
import { EquipmentItemSchema } from './equipment-item.model';
import { EquipSubType, isTwoHanded } from './enums/equip-sub-type.enum';

describe('equipment item sub type', () => {
    const EquipmentProbe = model('EquipSubTypeProbe', EquipmentItemSchema);

    it('lists the weapon families read from the catalog', () => {
        expect(Object.values(EquipSubType)).toEqual([
            'sword',
            'greatsword',
            'dagger',
            'axe',
            'mace',
            'warHammer',
            'spear',
            'bow',
            'shortStaff',
            'longStaff',
            'wand',
            'grimoire',
        ]);
    });

    it('holds the two-handed families in both hands', () => {
        expect(Object.values(EquipSubType).filter(isTwoHanded)).toEqual([
            'greatsword',
            'warHammer',
            'spear',
            'bow',
            'longStaff',
        ]);
    });

    it('treats a missing sub type as one-handed', () => {
        expect(isTwoHanded(null)).toBe(false);
        expect(isTwoHanded(undefined)).toBe(false);
    });

    it('leaves equipSubType absent until written', () => {
        const helm = new EquipmentProbe({ name: 'Elmo', equipType: 'helm' });

        expect(Object.keys(helm.toObject())).not.toContain('equipSubType');
    });

    it('stores a known sub type on a weapon', () => {
        const bow = new EquipmentProbe({
            name: 'Arco corto',
            equipType: 'weapon',
            equipSubType: 'bow',
        });

        expect(bow.toObject().equipSubType).toBe('bow');
        expect(bow.validateSync()?.errors?.equipSubType).toBeUndefined();
    });

    it('rejects a sub type outside the enum', () => {
        const invalid = new EquipmentProbe({
            name: 'Frusta',
            equipType: 'weapon',
            equipSubType: 'whip',
        });

        expect(Object.keys(invalid.validateSync()?.errors ?? {})).toEqual([
            'equipSubType',
        ]);
    });
});
