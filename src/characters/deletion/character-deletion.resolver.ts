import { Mutation, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CharacterDeletionService } from 'src/characters/deletion/character-deletion.service';
import { User } from 'src/models/user.model';

@Resolver()
export class CharacterDeletionResolver {
    constructor(
        private readonly characterDeletionService: CharacterDeletionService,
    ) {}

    // identità solo dal bearer (03.1 D-01): nessun argomento, agisce sul currentCharacter del chiamante
    @Mutation(() => User)
    deleteCharacter(@CurrentUser() identity: AuthIdentity): Promise<User> {
        return this.characterDeletionService.deleteCharacter(identity.userId);
    }
}
