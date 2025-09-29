import { registerEnumType } from "@nestjs/graphql";

export enum EnergyType {
    fire = "fire",
    cold = "cold",
    lightning = "lightning",
    acid = "acid",
    poison = "poison",
    thunder = "thunder",
    force = "force",
    necrotic = "necrotic",
    radiant = "radiant",
    psychic = "psychic",
    enhancing = "enhancing",
}

registerEnumType(EnergyType, { name: 'EnergyType' });
