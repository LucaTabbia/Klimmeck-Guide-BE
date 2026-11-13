import { Context, Info, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { QuestPrizes } from 'src/models/quest/quest-prizes.model';
import { Quest } from 'src/models/quest/quest.model';
import { ViewerVitalsService } from '../no-effect/viewer-vitals.service';
import type { PrizesSnapshot } from '../outcomes/rewards/quest-rewards';
import { QuestRankPrizes } from './quest-rank-prizes.type';
import { prizeBlockFor, rankBlocksOf } from './rank-prizes';

// un parent senza premi (PendingQuest.quest non popolato) risponde un premio vuoto invece di un errore (Pitfall 7)
const EMPTY_PRIZES: PrizesSnapshot = {
    prizeCoins: null,
    xpPrize: null,
    prizeItem: null,
    randomLoot: [],
    spell: null,
    pet: null,
    cure: null,
};

// premi per viewer (D-07, D-18, D-22): il blocco del titolo del personaggio corrente del bearer con la stessa regola della risoluzione;
// il payload WS è condiviso fra i subscriber: il parent non si muta mai e il titolo arriva dalla memo per viewer di noEffect
@Resolver(() => Quest)
export class QuestPrizesResolver {
    constructor(private readonly vitals: ViewerVitalsService) {}

    @ResolveField('prizes', () => QuestPrizes)
    async prizes(
        @Parent() quest: Quest,
        @CurrentUser() identity: AuthIdentity | undefined,
        @Context() context: object,
        @Info() info: GraphQLResolveInfo,
    ): Promise<PrizesSnapshot> {
        const subject = await this.vitals.of(identity, context, info);
        return prizeBlockFor(quest, subject?.title ?? null) ?? EMPTY_PRIZES;
    }

    // tutti i blocchi validi nell'ordine di prizes.rankPrizes a DB (per le generate coincide coi posti); [] per le solitarie e i boss senza blocchi (D-22, D-28)
    @ResolveField('rankPrizes', () => [QuestRankPrizes])
    rankPrizes(@Parent() quest: Quest): QuestRankPrizes[] {
        return rankBlocksOf(quest).map((block) => ({
            title: block.title,
            prizes: block,
        }));
    }
}
