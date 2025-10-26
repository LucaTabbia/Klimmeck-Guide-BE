import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { CharactersService } from './characters.service';
import { Character } from 'src/models/character/character.model';
import { Equipment } from 'src/models/common/equipment.model';
import { TransactionInput } from 'src/models/common/transaction-input.model';
import { TransactionResponse } from 'src/models/common/transaction-response.model';

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

    @Query(() => Equipment)
    async equipment(@Args('id') id: string): Promise<Equipment> {
        return this.charactersService.getEquipment(id);
    }

    @Mutation(() => TransactionResponse)
    async doTransaction(
        @Args('input', { type: () => TransactionInput }) input: TransactionInput): Promise<TransactionResponse> {
        return this.charactersService.doTransaction(input);
    }
}
