import { SlotType } from 'src/models/enums/slot-type.enum';
import { handsFreedBy, otherHandOf } from './hand-rule';

describe('hand rule', () => {
    it('pairs the two hands and nothing else', () => {
        expect(otherHandOf(SlotType.leftHand)).toBe(SlotType.rightHand);
        expect(otherHandOf(SlotType.rightHand)).toBe(SlotType.leftHand);
        expect(otherHandOf(SlotType.head)).toBeNull();
    });

    it('frees the other hand for a two-handed weapon', () => {
        expect(
            handsFreedBy({
                slot: SlotType.leftHand,
                itemTwoHanded: true,
                otherHandTwoHanded: false,
            }),
        ).toEqual([SlotType.rightHand]);
    });

    it('frees the other hand when it holds a two-handed weapon', () => {
        expect(
            handsFreedBy({
                slot: SlotType.rightHand,
                itemTwoHanded: false,
                otherHandTwoHanded: true,
            }),
        ).toEqual([SlotType.leftHand]);
    });

    it('keeps the other hand between one-handed pieces', () => {
        expect(
            handsFreedBy({
                slot: SlotType.rightHand,
                itemTwoHanded: false,
                otherHandTwoHanded: false,
            }),
        ).toEqual([]);
    });

    it('frees nothing outside the hands', () => {
        expect(
            handsFreedBy({
                slot: SlotType.head,
                itemTwoHanded: true,
                otherHandTwoHanded: true,
            }),
        ).toEqual([]);
    });
});
