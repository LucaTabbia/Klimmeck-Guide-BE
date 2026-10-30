import { RoadsService } from './roads.service';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Road } from 'src/models/road.model';
import { PathResponse } from 'src/models/path-response.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => Road)
export class RoadsResolver {
    constructor(private readonly roadsService: RoadsService) {}

    @Query(() => PathResponse)
    async getPath(
        @Args('from', { type: () => ID }, ObjectIdPipe) from: string,
        @Args('to', { type: () => ID }, ObjectIdPipe) to: string,
    ): Promise<PathResponse> {
        return this.roadsService.getShortestPath(from, to);
    }
}
