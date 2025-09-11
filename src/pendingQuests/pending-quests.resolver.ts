import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { PendingQuestsService } from './pending-quests.service';
import { PendingQuest } from 'src/models/pending-quest.model';

@Resolver(() => PendingQuest)
export class PendingQuestsResolver {
    constructor(private pendingQuestsService: PendingQuestsService) { }

    @Query(() => [PendingQuest])
    async pendingQuests(): Promise<PendingQuest[]> {
        return this.pendingQuestsService.findAll();
    }

    @Query(() => PendingQuest)
    async pendingQuest(@Args('id') id: string): Promise<PendingQuest> {
        return this.pendingQuestsService.findOne(id);
    }
}
