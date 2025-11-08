import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { AssetQuantity } from 'src/models/common/asset-quantity.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { PointOfInterestsService } from './point-of-interest.service';

@Resolver(() => PointOfInterest)
export class PointOfInterestsResolver {
    constructor(private pointOfInterestsService: PointOfInterestsService) { }

    @Query(() => [PointOfInterest])
    async pointOfInterests(): Promise<PointOfInterest[]> {
        return await this.pointOfInterestsService.findAll();
    }

    @Query(() => PointOfInterest)
    async pointOfInterest(@Args('id') id: string): Promise<PointOfInterest> {
        return await this.pointOfInterestsService.findOne(id);
    }
}
