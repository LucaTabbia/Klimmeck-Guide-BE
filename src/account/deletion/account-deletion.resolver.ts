import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AccountDeletionService } from 'src/account/deletion/account-deletion.service';
import { DeletedAccount } from 'src/account/deletion/deleted-account.model';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { AuditTarget } from 'src/authz/audit/audit-target.decorator';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';

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

    @Roles(RoleType.innkeeper)
    // registro dell'oste senza il nome utente (Phase 26 D-25): argomenti oscurati, bersaglio = Twitch ID risolto
    @AuditTarget('User', () => null, {
        argsOf: () => ({}),
        idOfResult: (result) => (result as DeletedAccount).twitchId,
    })
    @Mutation(() => DeletedAccount)
    deleteAccountByTwitchLogin(
        @Args('twitchLogin', { type: () => String }) twitchLogin: string,
    ): Promise<DeletedAccount> {
        return this.accountDeletionService.deleteByTwitchLogin(twitchLogin);
    }
}
