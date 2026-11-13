import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import { Quest } from 'src/models/quest/quest.model';
import { locksWhileRescued } from 'src/quests/outcomes/aid/aid-opening';
import { awaitsRescue } from 'src/quests/outcomes/aid/rescue-lock';
import { QuestsAwaitingRescueService } from './quests-awaiting-rescue.service';

// foglio strappato per tutti (quick 261113-aql, supera la D-15 della Phase 21): vero solo per una hunt o una dungeon con un'aid aperta nata da lei;
// stessa regola del rifiuto di acceptQuest; la FE non calcola nulla
@Resolver(() => Quest)
export class QuestAwaitingRescueResolver {
    constructor(private readonly awaiting: QuestsAwaitingRescueService) {}

    @ResolveField('awaitingRescue', () => Boolean)
    async awaitingRescue(
        @Parent() quest: Quest,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<boolean> {
        if (!locksWhileRescued(quest.infos?.type)) return false;
        return awaitsRescue(quest, await this.awaiting.of(context, info));
    }
}
