import { Args, Query, Resolver } from '@nestjs/graphql';
import { OwnsQuestResult } from 'src/authz/ownership/ownership.decorators';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { QuestResultsService } from './quest-results.service';

@Resolver(() => QuestResult)
export class QuestResultsResolver {
    constructor(private readonly results: QuestResultsService) {}

    // requery dopo la push o al resume (D-20): owner-only per utente, leggibile anche dopo la morte
    @OwnsQuestResult<{ id: string }>(({ id }) => id)
    @Query(() => QuestResult)
    questResult(@Args('id') id: string): Promise<QuestResult> {
        return this.results.findOne(id);
    }
}
