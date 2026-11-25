import { Mutation, Resolver } from '@nestjs/graphql';
import { AccountDeletionService } from 'src/account/deletion/account-deletion.service';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Resolver()
export class AccountDeletionResolver {
    constructor(
        private readonly accountDeletionService: AccountDeletionService,
    ) {}

    // identità solo dal bearer (Phase 26 D-20): nessun argomento
    @Mutation(() => Boolean)
    deleteMyAccount(@CurrentUser() identity: AuthIdentity): Promise<boolean> {
        return this.accountDeletionService.deleteOwnAccount(identity.userId);
    }
}
