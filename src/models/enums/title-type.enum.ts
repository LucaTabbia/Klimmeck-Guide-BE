import { registerEnumType } from "@nestjs/graphql";

export enum TitleType { rookie, adventurer, paladin, mage, hero, legend }

registerEnumType(TitleType, { name: 'TitleType' });
