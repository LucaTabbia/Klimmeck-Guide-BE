import { Field, ObjectType } from '@nestjs/graphql';
import { City } from '../city.model';
import { AssetQuantity } from '../common/asset-quantity.model';
import { Pet } from '../pet.model';

// lo scaffale di una città: pool curato a DB, veti di D-05 applicati in lettura (D-18)
@ObjectType()
export class CityShop {
    @Field(() => City)
    city: City;

    @Field(() => [AssetQuantity])
    equipment: AssetQuantity[];

    @Field(() => [AssetQuantity])
    loot: AssetQuantity[];

    @Field(() => [Pet])
    pets: Pet[];
}
