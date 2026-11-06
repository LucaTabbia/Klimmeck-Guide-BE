import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { travelConfigProvider } from 'src/config/travel-config';
import { EconomyModule } from 'src/economy/economy.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { User, UserSchema } from 'src/models/user.model';
import { PushModule } from 'src/push/push.module';
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { RoadsModule } from 'src/roads/roads.module';
import { TravelPlanningModule } from '../travel-planning.module';
import { AmbushResolutionService } from './ambush-resolution.service';
import { AmbushSweeper } from './ambush-sweeper';
import { AmbushProcessor } from './ambush.processor';

// imboscate in viaggio (Phase 15): montato da AppModule, mai da TravelModule (gli harness dei viaggi restano leggeri)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: City.name, schema: CitySchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: Lore.name, schema: LoreSchema },
            { name: User.name, schema: UserSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Quest.name, schema: QuestSchema },
        ]),
        TravelPlanningModule,
        RoadsModule,
        EconomyModule,
        PushModule,
        QuestOutcomesModule,
    ],
    providers: [
        { provide: Clock, useClass: SystemClock },
        travelConfigProvider,
        AmbushResolutionService,
        AmbushProcessor,
        AmbushSweeper,
    ],
    exports: [AmbushResolutionService, AmbushSweeper],
})
export class AmbushModule {}
