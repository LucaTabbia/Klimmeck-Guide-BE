import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { MissionDraft, MissionDraftSchema } from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';

// flusso guidato dell'oste (Phase 22): bozza, poi lista nemici, simulazione, premi e completamento
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: MissionDraft.name, schema: MissionDraftSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Character.name, schema: CharacterSchema },
        ]),
        QuestOutcomesModule,
    ],
    providers: [MissionDraftService, { provide: Clock, useClass: SystemClock }],
    exports: [MissionDraftService],
})
export class GuidedMissionModule {}
