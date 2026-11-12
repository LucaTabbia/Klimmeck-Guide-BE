import { registerEnumType } from '@nestjs/graphql';

export enum SlotType {
    arms = 'arms',
    legs = 'legs',
    leftHand = 'leftHand',
    rightHand = 'rightHand',
    chest = 'chest',
    head = 'head',
    firstAccessory = 'firstAccessory',
    secondAccessory = 'secondAccessory',
    feet = 'feet',
}

registerEnumType(SlotType, { name: 'SlotType' });
