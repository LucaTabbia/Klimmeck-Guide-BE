import { registerEnumType } from "@nestjs/graphql";

export enum SexType { male, female }

registerEnumType(SexType, { name: 'SexType' });
