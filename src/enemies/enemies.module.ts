import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnemiesResolver } from './enemies.resolver';
import { EnemiesService } from './enemies.service';
import { LoreVisibilityModule } from 'src/lore/lore-visibility.module';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreSchema } from 'src/models/lore.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Enemy.name, schema: EnemySchema },
            { name: Lore.name, schema: LoreSchema },
        ]),
        LoreVisibilityModule,
    ],
    providers: [EnemiesService, EnemiesResolver],
    exports: [EnemiesService],
})
export class EnemiesModule {}
