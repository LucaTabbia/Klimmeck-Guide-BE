import { SlotType } from 'src/models/enums/slot-type.enum';

const OTHER_HAND: Partial<Record<SlotType, SlotType>> = {
    [SlotType.leftHand]: SlotType.rightHand,
    [SlotType.rightHand]: SlotType.leftHand,
};

export const otherHandOf = (slot: SlotType): SlotType | null =>
    OTHER_HAND[slot] ?? null;

export interface HandChange {
    slot: SlotType;
    itemTwoHanded: boolean;
    otherHandTwoHanded: boolean;
}

// l'arma a due mani siede in una mano e tiene vuota l'altra: chi entra in una mano libera l'altra se una delle due armi è a due mani
export function handsFreedBy(change: HandChange): SlotType[] {
    const otherHand = otherHandOf(change.slot);
    if (!otherHand) return [];
    return change.itemTwoHanded || change.otherHandTwoHanded ? [otherHand] : [];
}
