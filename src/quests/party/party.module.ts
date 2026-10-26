import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestResolutionSchedulingModule } from 'src/quests/outcomes/scheduling/quest-resolution-scheduling.module';
import { QuestStartService } from './quest-start.service';

// avvio del party (utente 2026-10-25); senza il modulo push: lo importano accettazione, viaggio ed esiti senza cicli (C6)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
        QuestResolutionSchedulingModule,
    ],
    providers: [QuestStartService],
    exports: [QuestStartService],
})
export class PartyModule {}
