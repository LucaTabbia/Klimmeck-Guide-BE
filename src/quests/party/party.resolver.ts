import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { OwnsCharacter } from 'src/authz/ownership/ownership.decorators';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { requireCharacterObjectId } from 'src/characters/character-id';
import { CommonResponse } from 'src/models/common/common-response.model';
import { AbandonQuestRequest } from 'src/models/request/abandon-quest-request.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { PartyAbandonService } from './party-abandon.service';

@Resolver()
export class PartyResolver {
    constructor(private readonly abandonment: PartyAbandonService) {}

    // solo il proprietario (07 D-11): la corsia svuotata arriva su characterUpdated
    @OwnsCharacter<{ request: AbandonQuestRequest }>(
        ({ request }) => request.id,
        { ownerOnly: true },
    )
    @Mutation(() => CommonResponse)
    async abandonQuest(
        @Args('request', { type: () => AbandonQuestRequest })
        request: AbandonQuestRequest,
    ): Promise<CommonResponse> {
        const questId = objectIdFromHex(request.questId);
        if (!questId) throw ResourceNotFoundException.quest();
        await this.abandonment.abandon({
            characterId: requireCharacterObjectId(request.id),
            questId,
        });
        return { response: 'Missione abbandonata', successful: true };
    }
}
