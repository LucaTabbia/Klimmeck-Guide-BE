import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';

// accettazione lane-aware (07 D-18): il resolver acceptQuest arriva in 07-07
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: City.name, schema: CitySchema },
        ]),
        EconomyModule,
    ],
    providers: [QuestAcceptanceService],
    exports: [QuestAcceptanceService],
})
export class QuestAcceptanceModule {}
