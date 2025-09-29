import { registerEnumType } from "@nestjs/graphql";

export enum RoleType {
    guard = "guard",
    adventurer = "adventurer",
    innkeeper = "innkeeper",
}

registerEnumType(RoleType, { name: 'RoleType' });
