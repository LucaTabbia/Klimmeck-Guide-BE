import { registerEnumType } from "@nestjs/graphql";

export enum TitleType {
    rookie = "rookie",
    adventurer = "adventurer",
    paladin = "paladin",
    mage = "mage",
    hero = "hero",
    legend = "legend",
}

registerEnumType(TitleType, { name: 'TitleType' });
