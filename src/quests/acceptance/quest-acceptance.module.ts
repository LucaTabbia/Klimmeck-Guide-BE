import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { AuthzModule } from 'src/authz/authz.module';
import { EconomyModule } from 'src/economy/economy.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { City, CitySchema } from 'src/models/city.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestAcceptanceResolver } from 'src/quests/acceptance/quest-acceptance.resolver';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';
import { TravelPlanningModule } from 'src/travel/travel-planning.module';

// accettazione lane-aware (07 D-18); AuthzModule serve al guard owner-only del resolver (07 D-11)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: City.name, schema: CitySchema },
        ]),
        EconomyModule,
        AuthzModule,
        // TravelPlanningModule: piano e job del viaggio automatico (D-21); senza il modulo push (C6)
        TravelPlanningModule,
    ],
    providers: [
        QuestAcceptanceService,
        QuestAcceptanceResolver,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [QuestAcceptanceService],
})
export class QuestAcceptanceModule {}
