import { Resolver, Query, Args } from '@nestjs/graphql';
import { Spell } from 'src/models/spell.model';
import { SpellsService } from './spells.service';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => Spell)
export class SpellsResolver {
    constructor(private spellsService: SpellsService) {}

    @Query(() => [Spell])
    async spells(): Promise<Spell[]> {
        return this.spellsService.findAll();
    }

    @Query(() => Spell)
    async spell(@Args('id', ObjectIdPipe) id: string): Promise<Spell> {
        return this.spellsService.findOne(id);
    }
}
