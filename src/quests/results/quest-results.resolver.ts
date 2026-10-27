import { Inject } from '@nestjs/common';
import { Args, Query, Resolver, Subscription } from '@nestjs/graphql';
import { filter, pipe } from '@graphql-yoga/subscription';
import type { PubSub } from '@graphql-yoga/subscription';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
    OwnsCharacter,
    OwnsQuestResult,
} from 'src/authz/ownership/ownership.decorators';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestResultsService } from './quest-results.service';

@Resolver(() => QuestResult)
export class QuestResultsResolver {
    constructor(
        private readonly results: QuestResultsService,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
    ) {}

    // requery dopo la push o al resume (D-20): owner-only per utente, leggibile anche dopo la morte
    @OwnsQuestResult<{ id: string }>(({ id }) => id)
    @Query(() => QuestResult)
    questResult(@Args('id') id: string): Promise<QuestResult> {
        return this.results.findOne(id);
    }

    // i fogli che il giocatore non ha ancora chiuso, anche dopo la morte del personaggio (D-02): solo i propri, innkeeper compreso
    @Query(() => [QuestResult])
    unacknowledgedQuestResults(
        @CurrentUser() identity: AuthIdentity,
    ): Promise<QuestResult[]> {
        const userId = objectIdFromHex(identity.userId);
        if (!userId) return Promise.resolve([]);
        return this.results.findUnacknowledged(userId);
    }

    // owner-only alla subscribe (C10), nessuno snapshot (D-20): il filtro per evento guarda utente e personaggio del risultato,
    // non currentCharacter, così il risultato di morte arriva anche dopo lo scollegamento (Pitfall 3)
    @OwnsCharacter<{ characterId: string }>(({ characterId }) => characterId, {
        ownerOnly: true,
    })
    @Subscription(() => QuestResult, { name: 'questResultReceived' })
    questResultReceived(
        @Args('characterId') characterId: string,
        @CurrentUser() identity: AuthIdentity,
    ): AsyncIterableIterator<{ questResultReceived: QuestResult }> {
        return pipe(
            this.pubSub.subscribe('questResultReceived'),
            filter(
                ({ questResultReceived }) =>
                    String(questResultReceived.user) === identity.userId &&
                    String(questResultReceived.character) === characterId,
            ),
        );
    }
}
