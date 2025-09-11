import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { PetsService } from './pets.service';
import { Pet } from 'src/models/pet.model';

@Resolver(() => Pet)
export class PetsResolver {
    constructor(private petsService: PetsService) { }

    @Query(() => [Pet])
    async pets(): Promise<Pet[]> {
        return this.petsService.findAll();
    }

    @Query(() => Pet)
    async pet(@Args('id') id: string): Promise<Pet> {
        return this.petsService.findOne(id);
    }
}
