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
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestAcceptanceService } from 'src/quests/acceptance/quest-acceptance.service';

// primitiva interna senza resolver (04 D-09): la Phase 7 la monta nella mutation lane-aware
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
        EconomyModule,
    ],
    providers: [QuestAcceptanceService],
    exports: [QuestAcceptanceService],
})
export class QuestAcceptanceModule {}
