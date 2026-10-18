import { Resolver, Query, Args, Mutation, Subscription } from '@nestjs/graphql';
import { CharactersService } from './characters.service';
import { Character } from 'src/models/character/character.model';
import { Equipment } from 'src/models/common/equipment.model';
import { CommonResponse } from 'src/models/common/common-response.model';
import { Inject } from '@nestjs/common';
import { filter, pipe } from '@graphql-yoga/subscription';
import type { PubSub } from '@graphql-yoga/subscription';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ShopTransactionService } from 'src/economy/trade/shop-transaction.service';
import { CharacterAccessPolicy } from 'src/authz/ownership/character-access.policy';
import { OwnsCharacter } from 'src/authz/ownership/ownership.decorators';
import { Roles } from 'src/authz/roles/roles.decorator';
import { subscribeWithSnapshot } from 'src/graphql/subscribe-with-snapshot';
import { RoleType } from 'src/models/enums/role-type.enum';
import { documentIdOf } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { TransactionRequest } from 'src/models/request/transaction-request.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { EquipSpellRequest } from 'src/models/request/equip-spell-request.model';
import { UseSpellRequest } from 'src/models/request/use-spell-request.model';

@Resolver(() => Character)
export class CharactersResolver {
    constructor(
        private readonly charactersService: CharactersService,
        private readonly characterAccess: CharacterAccessPolicy,
        private readonly shopTransactions: ShopTransactionService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    @Roles(RoleType.innkeeper)
    @Query(() => [Character])
    async characters(): Promise<Character[]> {
        return this.charactersService.findAll();
    }

    @OwnsCharacter<{ id: string }>(({ id }) => id)
    @Query(() => Character)
    async character(@Args('id') id: string): Promise<Character> {
        return this.charactersService.findOne(id);
    }

    @OwnsCharacter<{ id: string }>(({ id }) => id)
    @Query(() => Equipment)
    async equipment(@Args('id') id: string): Promise<Equipment> {
        return this.charactersService.getEquipment(id);
    }

    @OwnsCharacter<{ request: TransactionRequest }>(({ request }) => request.id)
    @Mutation(() => CommonResponse)
    async doTransaction(
        @Args('request', { type: () => TransactionRequest })
        request: TransactionRequest,
    ): Promise<CommonResponse> {
        // prezzi dal catalogo e unica transazione (04 D-06/D-07): il resolver resta l'unico punto di ownership
        return this.shopTransactions.execute(request);
    }

    @OwnsCharacter<{ request: EquipItemRequest }>(({ request }) => request.id)
    @Mutation(() => CommonResponse)
    async equipItem(
        @Args('request', { type: () => EquipItemRequest })
        request: EquipItemRequest,
    ): Promise<CommonResponse> {
        return this.charactersService.equipItem(request);
    }

    @OwnsCharacter<{ request: EquipSpellRequest }>(({ request }) => request.id)
    @Mutation(() => CommonResponse)
    async equipSpell(
        @Args('request', { type: () => EquipSpellRequest })
        request: EquipSpellRequest,
    ): Promise<CommonResponse> {
        return this.charactersService.equipSpell(request);
    }

    @OwnsCharacter<{ request: EquipSpellRequest }>(({ request }) => request.id)
    @Mutation(() => CommonResponse)
    async unequipSpell(
        @Args('request', { type: () => EquipSpellRequest })
        request: EquipSpellRequest,
    ): Promise<CommonResponse> {
        return this.charactersService.unequipSpell(request);
    }

    @OwnsCharacter<{ request: UseSpellRequest }>(
        ({ request }) => request.characterId,
    )
    @Mutation(() => CommonResponse)
    async useSpell(
        @Args('request', { type: () => UseSpellRequest })
        request: UseSpellRequest,
    ): Promise<CommonResponse> {
        return this.charactersService.useSpell(request);
    }

    // il guard rifiuta l'id altrui prima dello snapshot (FORBIDDEN, innkeeper ammesso); il filtro per evento
    // ricontrolla la proprietà, così un cambio di currentCharacter a stream aperto non fa trapelare nulla (D-04)
    @OwnsCharacter<{ id: string }>(({ id }) => id)
    @Subscription(() => Character, { name: 'characterUpdated' })
    characterUpdated(
        @Args('id') id: string,
        @CurrentUser() identity: AuthIdentity,
    ): Promise<AsyncIterableIterator<{ characterUpdated: Character }>> {
        const live = pipe(
            this.pubSub.subscribe('characterUpdated'),
            filter(({ characterUpdated }) =>
                this.mayDeliver(identity, id, characterUpdated),
            ),
        );
        return subscribeWithSnapshot(live, async () => ({
            characterUpdated: await this.charactersService.findOne(id),
        }));
    }

    // fail-closed: la policy non lancia, un errore di lettura scarta l'evento
    private async mayDeliver(
        identity: AuthIdentity,
        id: string,
        character: Character,
    ): Promise<boolean> {
        if (documentIdOf(character) !== id) return false;
        return this.characterAccess.mayReceiveCharacterEvent(identity, id);
    }
}
