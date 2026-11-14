import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { PushModule } from 'src/push/push.module';
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { QuestResultsReadModule } from 'src/quests/results/quest-results-read.module';
import { GuidedCompletionService } from './guided-completion.service';
import { GuidedMissionResolver } from './guided-mission.resolver';
import { MissionDraftSaveService } from './mission-draft-save.service';
import { MissionDraftPresenter } from './mission-draft.mapper';
import { MissionDraft, MissionDraftSchema } from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';
import { MissionEnemiesService } from './mission-enemies.service';
import { MissionPrizeOptionsService } from './mission-prize-options.service';
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
            { name: Quest.name, schema: QuestSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Pet.name, schema: PetSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
        QuestOutcomesModule,
        QuestResultsReadModule,
        PushModule,
    ],
    providers: [
        MissionDraftService,
        MissionDraftPresenter,
        MissionEnemiesService,
        MISSION_SIMULATION_CHANCE_PROVIDER,
        MissionSimulationService,
        MissionPrizeOptionsService,
        MissionDraftSaveService,
        GuidedCompletionService,
        GuidedMissionResolver,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [MissionDraftService],
})
export class GuidedMissionModule {}
