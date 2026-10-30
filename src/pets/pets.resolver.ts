import { Resolver, Query, Args } from '@nestjs/graphql';
import { PetsService } from './pets.service';
import { Pet } from 'src/models/pet.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => Pet)
export class PetsResolver {
    constructor(private petsService: PetsService) {}

    @Query(() => [Pet])
    async pets(): Promise<Pet[]> {
        return this.petsService.findAll();
    }

    @Query(() => Pet)
    async pet(@Args('id', ObjectIdPipe) id: string): Promise<Pet> {
        return this.petsService.findOne(id);
    }
}
