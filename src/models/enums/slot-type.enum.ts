import { registerEnumType } from "@nestjs/graphql";

export enum SlotType {
    arms = "arms",
    legs = "legs",
    leftHand = "leftHand",
    rightHand = "rightHand",
    chest = "chest",
    head = "head",
    firstAccessory = "firstAccessory",
    secondAccessory = "secondAccessory",
    foots = "foots"
}

registerEnumType(SlotType, { name: 'SlotType' });
