import { Types } from 'mongoose';
import { SlotType } from 'src/models/enums/slot-type.enum';
import {
    classifyEquipItemFailure,
    equipItemFilter,
    equipItemUpdate,
} from './equip-item.updates';

describe('equip item builders', () => {
    const c = new Types.ObjectId();
    const i = new Types.ObjectId();

    it('equipItemFilter requires ownership of the item', () => {
        expect(equipItemFilter(c, i, [SlotType.head])).toMatchObject({
            _id: c,
            deletedAt: null,
            'assets.ownedEquipments.item': i,
        });
    });

    it('equipItemFilter asks for one copy more than the other slots wear', () => {
        const filter = equipItemFilter(c, i, [SlotType.rightHand]);
        const wornElsewhere = JSON.stringify(filter);

        expect(wornElsewhere).toContain('$assets.wornEquipment.leftHand');
        expect(wornElsewhere).not.toContain('$assets.wornEquipment.rightHand');
    });

    it('equipItemFilter does not count the copy in a hand being freed', () => {
        const filter = equipItemFilter(c, i, [
            SlotType.rightHand,
            SlotType.leftHand,
        ]);
        const wornElsewhere = JSON.stringify(filter);

        expect(wornElsewhere).not.toContain('$assets.wornEquipment.leftHand');
        expect(wornElsewhere).toContain('$assets.wornEquipment.head');
    });

    it('equipItemFilter has no ownership guard when clearing the slot', () => {
        expect(equipItemFilter(c, null, [SlotType.head])).toEqual({
            _id: c,
            deletedAt: null,
        });
    });

    it('equipItemUpdate empties the freed hands in the same write', () => {
        expect(
            equipItemUpdate(SlotType.leftHand, i, [SlotType.rightHand]),
        ).toEqual({
            $set: {
                'assets.wornEquipment.leftHand': i,
                'assets.wornEquipment.rightHand': null,
            },
        });
    });

    it('equipItemUpdate sets the slot to the item or to null', () => {
        expect(equipItemUpdate(SlotType.head, i)).toEqual({
            $set: { 'assets.wornEquipment.head': i },
        });
        expect(equipItemUpdate(SlotType.leftHand, null)).toEqual({
            $set: { 'assets.wornEquipment.leftHand': null },
        });
    });

    it('writes the feet slot under the worn equipment (D-06)', () => {
        expect(equipItemUpdate(SlotType.feet, i)).toEqual({
            $set: { 'assets.wornEquipment.feet': i },
        });
    });

    it('classifyEquipItemFailure tells an unowned item from a missing character', () => {
        expect(classifyEquipItemFailure(true, false)).toMatchObject({
            code: 'ITEM_NOT_OWNED',
        });
        expect(classifyEquipItemFailure(false, false)).toMatchObject({
            code: 'NOT_FOUND',
        });
    });

    it('classifyEquipItemFailure blames the missing copy when the item is owned', () => {
        expect(classifyEquipItemFailure(true, true)).toMatchObject({
            code: 'INSUFFICIENT_ITEM_QUANTITY',
        });
    });
});
