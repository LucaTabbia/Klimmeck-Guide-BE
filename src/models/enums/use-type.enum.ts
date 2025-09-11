import { registerEnumType } from "@nestjs/graphql";

export enum UseType {
    defense,
    attack,
    control,
    illusion,
    charm,
    confuse,
    enhance,
    infuse
}

registerEnumType(UseType, { name: 'UseType' });
