import { registerEnumType } from "@nestjs/graphql";

export enum SexType {
    male = "male",
    female = "female"
}

registerEnumType(SexType, { name: 'SexType' });
