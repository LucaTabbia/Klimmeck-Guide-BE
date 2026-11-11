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
        expect(equipItemFilter(c, i)).toEqual({
            _id: c,
            deletedAt: null,
            'assets.ownedEquipments.item': i,
        });
    });

    it('equipItemFilter has no ownership guard when clearing the slot', () => {
        expect(equipItemFilter(c, null)).toEqual({ _id: c, deletedAt: null });
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
        expect(classifyEquipItemFailure(true)).toMatchObject({
            code: 'ITEM_NOT_OWNED',
        });
        expect(classifyEquipItemFailure(false)).toMatchObject({
            code: 'NOT_FOUND',
        });
    });
});
