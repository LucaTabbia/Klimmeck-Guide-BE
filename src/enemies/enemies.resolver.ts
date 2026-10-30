import { Resolver, Query, Args } from '@nestjs/graphql';
import { EnemiesService } from './enemies.service';
import { Enemy } from 'src/models/enemy.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => Enemy)
export class EnemiesResolver {
    constructor(private enemiesService: EnemiesService) {}

    @Query(() => [Enemy])
    async enemys(): Promise<Enemy[]> {
        return this.enemiesService.findAll();
    }

    @Query(() => Enemy)
    async enemy(@Args('id', ObjectIdPipe) id: string): Promise<Enemy> {
        return this.enemiesService.findOne(id);
    }
}
