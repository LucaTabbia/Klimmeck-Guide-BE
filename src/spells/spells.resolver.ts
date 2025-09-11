import { Resolver, Query, Args } from '@nestjs/graphql';
import { Spell } from 'src/models/spell.model';
import { SpellsService } from './spells.service';

@Resolver(() => Spell)
export class SpellsResolver {
    constructor(private spellsService: SpellsService) { }

    @Query(() => [Spell])
    async spells(): Promise<Spell[]> {
        return this.spellsService.findAll();
    }

    @Query(() => Spell)
    async spell(@Args('id') id: string): Promise<Spell> {
        return this.spellsService.findOne(id);
    }
}
