import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Types } from 'mongoose';
import { OwnsCharacter } from 'src/authz/ownership/ownership.decorators';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { requireCharacterObjectId } from 'src/characters/character-id';
import { CommonResponse } from 'src/models/common/common-response.model';
import { TravelRequest } from 'src/models/request/travel-request.model';
import { TravelPreview } from 'src/models/travel-preview.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { TravelService } from './travel.service';

@Resolver()
export class TravelResolver {
    constructor(private readonly travel: TravelService) {}

    // solo il proprietario (D-18): l'innkeeper muove gli altri col teleport
    @OwnsCharacter<{ request: TravelRequest }>(({ request }) => request.id, {
        ownerOnly: true,
    })
    @Mutation(() => CommonResponse)
    async startTravel(
        @Args('request', { type: () => TravelRequest })
        request: TravelRequest,
    ): Promise<CommonResponse> {
        await this.travel.startTravel(
            requireCharacterObjectId(request.id),
            poiIdOf(request.poiId),
        );
        return { response: 'Viaggio iniziato', successful: true };
    }

    @OwnsCharacter<{ request: TravelRequest }>(({ request }) => request.id, {
        ownerOnly: true,
    })
    @Query(() => TravelPreview)
    travelPreview(
        @Args('request', { type: () => TravelRequest })
        request: TravelRequest,
    ): Promise<TravelPreview> {
        return this.travel.preview(
            requireCharacterObjectId(request.id),
            poiIdOf(request.poiId),
        );
    }
}

// POI malformato = luogo inesistente (D-04): mai new Types.ObjectId() su input non validato
function poiIdOf(hex: string): Types.ObjectId {
    const poiId = objectIdFromHex(hex);
    if (!poiId) throw ResourceNotFoundException.pointOfInterest();
    return poiId;
}
