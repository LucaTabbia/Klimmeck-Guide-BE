import { RoadsService } from './roads.service';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Road } from 'src/models/road.model';
import { PathResponse } from 'src/models/path-response.model';

@Resolver(() => Road)
export class RoadsResolver {
  constructor(private readonly roadsService: RoadsService) { }

  @Query(() => PathResponse)
  async getPath(@Args('from', { type: () => ID }) from: string, @Args('to', { type: () => ID }) to: string): Promise<PathResponse> {
    return this.roadsService.getShortestPath(from, to);
  }

}
