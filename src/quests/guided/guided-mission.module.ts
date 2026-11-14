import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { GuidedMissionResolver } from './guided-mission.resolver';
import { MissionDraftPresenter } from './mission-draft.mapper';
import { MissionDraft, MissionDraftSchema } from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';
import { MissionEnemiesService } from './mission-enemies.service';
import { MISSION_SIMULATION_CHANCE_PROVIDER } from './mission-simulation.chance';
import { MissionSimulationService } from './mission-simulation.service';

// flusso guidato dell'oste (Phase 22): bozza, poi lista nemici, simulazione, premi e completamento
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: MissionDraft.name, schema: MissionDraftSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
        ]),
        QuestOutcomesModule,
    ],
    providers: [
        MissionDraftService,
        MissionDraftPresenter,
        MissionEnemiesService,
        MISSION_SIMULATION_CHANCE_PROVIDER,
        MissionSimulationService,
        GuidedMissionResolver,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [MissionDraftService],
})
export class GuidedMissionModule {}
