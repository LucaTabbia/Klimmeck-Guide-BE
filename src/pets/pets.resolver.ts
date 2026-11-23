import { Resolver, Query, Args } from '@nestjs/graphql';
import { PetsService } from './pets.service';
import { Pet } from 'src/models/pet.model';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => Pet)
export class PetsResolver {
    constructor(private petsService: PetsService) {}

    // il catalogo intero è dell'oste (quick 261123-lcv): il giocatore riceve i pet dalle lore che ha sbloccato
    @Roles(RoleType.innkeeper)
    @Query(() => [Pet])
    async pets(): Promise<Pet[]> {
        return this.petsService.findAll();
    }

    @Query(() => Pet)
    async pet(@Args('id', ObjectIdPipe) id: string): Promise<Pet> {
        return this.petsService.findOne(id);
    }
}
