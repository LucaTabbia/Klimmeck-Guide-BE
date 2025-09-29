import { registerEnumType } from "@nestjs/graphql";

export enum PronounType {
    he = "he",
    she = "she",
    them = "them",
}

registerEnumType(PronounType, { name: 'PronounType' });
