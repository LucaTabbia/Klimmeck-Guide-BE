import { registerEnumType } from "@nestjs/graphql";

export enum EnergyType {
    fire,
    cold,
    lightning,
    acid,
    poison,
    thunder,
    force,
    necrotic,
    radiant,
    psychic,
    enhancing
}

registerEnumType(EnergyType, { name: 'EnergyType' });
