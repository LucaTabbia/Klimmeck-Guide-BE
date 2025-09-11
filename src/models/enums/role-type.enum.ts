import { registerEnumType } from "@nestjs/graphql";

export enum RoleType {
    guard,
    adventurer,
    innkeeper
}

registerEnumType(RoleType, { name: 'RoleType' });
