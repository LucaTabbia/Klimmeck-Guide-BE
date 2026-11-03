import { Resolver, Query, Args, ResolveField, Parent } from '@nestjs/graphql';
import { CitiesService } from './cities.service';
import { City } from 'src/models/city.model';
import { CitySize } from 'src/models/enums/city-size.enum';
import { hasShopOf } from 'src/shops/shop-pool.rules';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';
import { citySizeOf } from './city-size';

@Resolver(() => City)
export class CitiesResolver {
    constructor(private citiesService: CitiesService) {}

    @Query(() => [City])
    async cities(): Promise<City[]> {
        return this.citiesService.findAll();
    }

    @Query(() => City)
    async city(@Args('id', ObjectIdPipe) id: string): Promise<City> {
        return this.citiesService.findOne(id);
    }

    @ResolveField('size', () => CitySize)
    size(@Parent() city: City): CitySize {
        return citySizeOf(city.type);
    }

    @ResolveField('hasShop', () => Boolean)
    hasShop(@Parent() city: City): boolean {
        return hasShopOf(city);
    }
}
