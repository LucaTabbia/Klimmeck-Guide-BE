import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
    ],
    providers: [QuestAcceptanceService, QuestAcceptanceResolver],
    exports: [QuestAcceptanceService],
})
export class QuestAcceptanceModule {}
