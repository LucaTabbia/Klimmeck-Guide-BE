import { Resolver, Query, Args, Mutation, Subscription } from '@nestjs/graphql';
import { CharactersService } from './characters.service';
import { Character } from 'src/models/character/character.model';
import { Equipment } from 'src/models/common/equipment.model';
import { CommonResponse } from 'src/models/common/common-response.model';
import { Inject } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { PubSubEvents } from 'src/pubsub.module';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';

@Resolver(() => Character)
export class CharactersResolver {
    constructor(
        private readonly charactersService: CharactersService,
        @Inject('PUB_SUB') private pubSub: PubSub<PubSubEvents>
    ) { }

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

    @Mutation(() => CommonResponse)
    async doTransaction(
        @Args('request', { type: () => TransactionRequest }) request: TransactionRequest,
    ): Promise<CommonResponse> {
        return this.charactersService.doTransaction(request);
    }


    @Mutation(() => CommonResponse)
    async equipItem(
        @Args('request', { type: () => EquipItemRequest }) request: EquipItemRequest,
    ): Promise<CommonResponse> {
        return this.charactersService.equipItem(request);
    }

    @Subscription(() => Character, {
        name: 'characterUpdated',
        filter: (payload, variables) => {
            return payload.characterUpdated._id.toString() === variables.id;
        },
    })
    characterUpdated(@Args('id') id: string) {
        return this.pubSub.subscribe('characterUpdated');
    }
}
