import { Resolver, Query, Args } from '@nestjs/graphql';
import { EnemiesService } from './enemies.service';
import { Enemy } from 'src/models/enemy.model';
import { Roles } from 'src/authz/roles/roles.decorator';
import { RoleType } from 'src/models/enums/role-type.enum';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@Resolver(() => Enemy)
export class EnemiesResolver {
    constructor(private enemiesService: EnemiesService) {}

    // il catalogo intero è dell'oste (quick 261123-lcv): il giocatore riceve i nemici dalle lore che ha sbloccato
    @Roles(RoleType.innkeeper)
    @Query(() => [Enemy])
    async enemys(): Promise<Enemy[]> {
        return this.enemiesService.findAll();
    }

    @Query(() => Enemy)
    async enemy(@Args('id', ObjectIdPipe) id: string): Promise<Enemy> {
        return this.enemiesService.findOne(id);
    }
}
