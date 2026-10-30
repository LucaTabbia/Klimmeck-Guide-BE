import { Resolver, Query, Args } from '@nestjs/graphql';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { PointOfInterestsService } from './point-of-interest.service';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => PointOfInterest)
export class PointOfInterestsResolver {
    constructor(private pointOfInterestsService: PointOfInterestsService) {}

    @Query(() => [PointOfInterest])
    async pointOfInterests(): Promise<PointOfInterest[]> {
        return await this.pointOfInterestsService.findAll();
    }

    @Query(() => PointOfInterest)
    async pointOfInterest(
        @Args('id', ObjectIdPipe) id: string,
    ): Promise<PointOfInterest> {
        return await this.pointOfInterestsService.findOne(id);
    }
}
