import { Resolver, Query, Args } from '@nestjs/graphql';
import { QuestsService } from './quests.service';
import { Quest } from 'src/models/quest/quest.model';

@Resolver(() => Quest)
export class QuestsResolver {
    constructor(private questsService: QuestsService) { }

    @Query(() => [Quest])
    async quests(): Promise<Quest[]> {
        return this.questsService.findAll();
    }

    @Query(() => Quest)
    async quest(@Args('id') id: string): Promise<Quest> {
        return this.questsService.findOne(id);
    }
}
