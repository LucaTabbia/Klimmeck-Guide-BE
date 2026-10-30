import { Resolver, Query, Args } from '@nestjs/graphql';
import { CitiesService } from './cities.service';
import { City } from 'src/models/city.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

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
}
