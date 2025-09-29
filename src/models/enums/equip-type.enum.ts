import { registerEnumType } from "@nestjs/graphql";

export enum EquipType {
    helm = "helm",
    chestPiece = "chestPiece",
    boots = "boots",
    greaves = "greaves",
    weapon = "weapon",
    shield = "shield",
    gloves = "gloves",
    ring = "ring",
    necklace = "necklace",
}

registerEnumType(EquipType, { name: 'EquipType' });
