import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { OwnsCharacter } from 'src/authz/ownership/ownership.decorators';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { requireCharacterObjectId } from 'src/characters/character-id';
import { CommonResponse } from 'src/models/common/common-response.model';
import { AcceptQuestRequest } from 'src/models/request/accept-quest-request.model';
import { TravelPreview } from 'src/models/travel-preview.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { QuestAcceptanceService } from './quest-acceptance.service';

@Resolver()
export class QuestAcceptanceResolver {
    constructor(private readonly acceptance: QuestAcceptanceService) {}

    // solo il proprietario (07 D-11): l'innkeeper non spende i punti altrui; la corsia arriva su characterUpdated, il saldo su userUpdated (D-12)
    @OwnsCharacter<{ request: AcceptQuestRequest }>(
        ({ request }) => request.id,
        { ownerOnly: true },
    )
    @Mutation(() => CommonResponse)
    async acceptQuest(
        @Args('request', { type: () => AcceptQuestRequest })
        request: AcceptQuestRequest,
        @CurrentUser() identity: AuthIdentity,
    ): Promise<CommonResponse> {
        const questId = objectIdFromHex(request.questId);
        if (!questId) throw ResourceNotFoundException.quest();
        const ownerId = objectIdFromHex(identity.userId);
        if (!ownerId) throw ResourceNotFoundException.user();
        await this.acceptance.accept({
            ownerId,
            characterId: requireCharacterObjectId(request.id),
            questId,
        });
        return { response: 'Missione accettata', successful: true };
    }

    // solo il proprietario (07 D-11, Phase 14 D-08): stessa forma di travelPreview, null senza viaggio
    @OwnsCharacter<{ request: AcceptQuestRequest }>(
        ({ request }) => request.id,
        { ownerOnly: true },
    )
    @Query(() => TravelPreview, { nullable: true })
    questTravelPreview(
        @Args('request', { type: () => AcceptQuestRequest })
        request: AcceptQuestRequest,
    ): Promise<TravelPreview | null> {
        const questId = objectIdFromHex(request.questId);
        if (!questId) throw ResourceNotFoundException.quest();
        return this.acceptance.previewTravel(
            requireCharacterObjectId(request.id),
            questId,
        );
    }
}
