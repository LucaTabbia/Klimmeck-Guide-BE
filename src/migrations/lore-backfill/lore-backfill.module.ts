import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoreGeographyModule } from 'src/lore/lore-geography.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { LoreBackfillBoot } from './lore-backfill.boot';
import { LoreBackfillMigrator } from './lore-backfill.migrator';

// importato SOLO da AppModule: gli harness non lo eseguono; rimosso prima della merge.
// i modelli registrati danno al migrator i nomi delle collection
@Module({
    imports: [
        LoreGeographyModule,
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: Enemy.name, schema: EnemySchema },
        ]),
    ],
    providers: [LoreBackfillMigrator, LoreBackfillBoot],
})
export class LoreBackfillModule {}
