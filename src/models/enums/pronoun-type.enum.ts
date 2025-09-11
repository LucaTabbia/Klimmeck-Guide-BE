import { registerEnumType } from "@nestjs/graphql";


export enum PronounType { he, she, them }

registerEnumType(PronounType, { name: 'PronounType' });
