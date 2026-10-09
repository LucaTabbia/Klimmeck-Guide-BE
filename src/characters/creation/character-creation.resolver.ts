import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CharacterCreationService } from 'src/characters/creation/character-creation.service';
import { listRaceTraits } from 'src/characters/creation/race-traits';
import { RaceTraits } from 'src/models/character/race-traits.model';
import { CreateCharacterInput } from 'src/models/request/create-character-request.model';
import { User } from 'src/models/user.model';

@Resolver()
export class CharacterCreationResolver {
    constructor(
        private readonly characterCreationService: CharacterCreationService,
    ) {}

    // identità solo dal bearer (D-01, D-15): l'input non ha userId/twitchId
    @Mutation(() => User)
    createCharacter(
        @CurrentUser() identity: AuthIdentity,
        @Args('input') input: CreateCharacterInput,
    ): Promise<User> {
        return this.characterCreationService.createCharacter(
            identity.userId,
            input,
        );
    }

    @Query(() => [RaceTraits])
    raceTraits(): RaceTraits[] {
        return listRaceTraits();
    }
}
