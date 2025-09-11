import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnemiesResolver } from './enemies.resolver';
import { EnemiesService } from './enemies.service';
import { Enemy, EnemySchema } from 'src/models/enemy.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Enemy.name, schema: EnemySchema },
        ]),
    ],
    providers: [EnemiesService, EnemiesResolver],
    exports: [EnemiesService],
})
export class EnemiesModule { }
