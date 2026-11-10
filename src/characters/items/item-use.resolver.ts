import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ItemUseService } from 'src/characters/items/item-use.service';
import { UseItemResult } from 'src/characters/items/use-item-result.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver()
export class ItemUseResolver {
    constructor(private readonly itemUseService: ItemUseService) {}

    // identità solo dal bearer (Phase 18 D-21): agisce sul currentCharacter del chiamante, oste compreso
    @Mutation(() => UseItemResult)
    useItem(
        @Args('itemId', { type: () => ID }, ObjectIdPipe) itemId: string,
        @CurrentUser() identity: AuthIdentity,
    ): Promise<UseItemResult> {
        return this.itemUseService.useItem(identity.userId, itemId);
    }
}
