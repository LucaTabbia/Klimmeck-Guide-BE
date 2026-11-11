import { Int, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { maxActiveSpellsFor } from 'src/models/character/active-spell-slots';
import { CharacterStatus } from 'src/models/character/character-status.model';

@Resolver(() => CharacterStatus)
export class CharacterStatusResolver {
    @ResolveField('maxActiveSpells', () => Int)
    maxActiveSpells(@Parent() status: CharacterStatus): number {
        return maxActiveSpellsFor(status.xp ?? 0, status.title);
    }
}
