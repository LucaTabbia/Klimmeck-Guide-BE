import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { CharactersService } from './characters.service';
import { Character } from 'src/models/character/character.model';

@Resolver(() => Character)
export class CharactersResolver {
    constructor(private charactersService: CharactersService) { }

    @Query(() => [Character])
    async characters(): Promise<Character[]> {
        return this.charactersService.findAll();
    }

    @Query(() => Character)
    async character(@Args('id') id: string): Promise<Character> {
        return this.charactersService.findOne(id);
    }
}
