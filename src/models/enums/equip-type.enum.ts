import { registerEnumType } from "@nestjs/graphql";

export enum EquipType {
    helm,
    chestPiece,
    boots,
    greaves,
    weapon,
    shield,
    gloves,
    ring,
    necklace
}

registerEnumType(EquipType, { name: 'EquipType' });
