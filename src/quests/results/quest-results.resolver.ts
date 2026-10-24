import { Args, Query, Resolver } from '@nestjs/graphql';
import { OwnsQuestResult } from 'src/authz/ownership/ownership.decorators';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { QuestResultsService } from './quest-results.service';

@Resolver(() => QuestResult)
export class QuestResultsResolver {
    constructor(private readonly results: QuestResultsService) {}

    @OwnsQuestResult<{ id: string }>(({ id }) => id)
    @Query(() => QuestResult)
    questResult(@Args('id') _id: string): Promise<QuestResult> {
        throw new Error('not implemented');
    }
}
