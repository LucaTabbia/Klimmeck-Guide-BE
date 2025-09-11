import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { CitiesService } from './cities.service';
import { City } from 'src/models/city.model';

@Resolver(() => City)
export class CitiesResolver {
    constructor(private citiesService: CitiesService) { }

    @Query(() => [City])
    async cities(): Promise<City[]> {
        return this.citiesService.findAll();
    }

    @Query(() => City)
    async city(@Args('id') id: string): Promise<City> {
        return this.citiesService.findOne(id);
    }
}
