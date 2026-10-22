import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Roles } from 'src/authz/roles/roles.decorator';
import { requireCharacterObjectId } from 'src/characters/character-id';
import { CommonResponse } from 'src/models/common/common-response.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { TravelRequest } from 'src/models/request/travel-request.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { TravelService } from './travel.service';

@Resolver()
export class TravelAdminResolver {
    constructor(private readonly travel: TravelService) {}

    // innkeeper soltanto, auditato automaticamente (Phase 3 D-15/D-16); target dell'audit CommonResponse con id null, il personaggio è in args.request (C7)
    // strumento del GM (D-16): qualsiasi POI esistente; riusa TravelRequest { id, poiId } (nessun input dedicato)
    @Roles(RoleType.innkeeper)
    @Mutation(() => CommonResponse)
    async teleportCharacter(
        @Args('request', { type: () => TravelRequest })
        request: TravelRequest,
    ): Promise<CommonResponse> {
        const poiId = objectIdFromHex(request.poiId);
        if (!poiId) throw ResourceNotFoundException.pointOfInterest();
        await this.travel.teleport(requireCharacterObjectId(request.id), poiId);
        return { response: 'Personaggio teletrasportato', successful: true };
    }
}
