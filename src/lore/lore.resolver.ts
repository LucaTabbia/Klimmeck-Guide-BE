import { Resolver, Query, Args } from '@nestjs/graphql';
import { Lore } from 'src/models/lore.model';
import { LoreService } from './lore.service';

@Resolver(() => Lore)
export class LoreResolver {
    constructor(private loresService: LoreService) { }

    @Query(() => [Lore])
    async lores(): Promise<Lore[]> {
        return this.loresService.findAll();
    }

    @Query(() => Lore)
    async lore(@Args('id') id: string): Promise<Lore> {
        return this.loresService.findOne(id);
    }
}
