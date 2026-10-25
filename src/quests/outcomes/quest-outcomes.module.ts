import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { questConfigProvider } from 'src/config/quest-config';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { EconomyModule } from 'src/economy/economy.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
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
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { User, UserSchema } from 'src/models/user.model';
import { PushModule } from 'src/push/push.module';
import { PartyModule } from 'src/quests/party/party.module';
import {
    QUEUE_CALL_TIMEOUT,
    QUEUE_CALL_TIMEOUT_MS,
} from 'src/queues/queue-call-timeout';
import { BossResolutionService } from './boss-resolution.service';
import { ChanceSource, MathChanceSource } from './chance-source';
import { CombatResolver } from './combat/combat-resolver';
import { GmCompletionService } from './gm-completion.service';
import { PlaceholderCombatResolver } from './combat/placeholder-combat-resolver';
import { OutcomeWriter } from './outcome-writer.service';
import { QuestResolutionProcessor } from './quest-resolution.processor';
import { QuestResolutionService } from './quest-resolution.service';
import { QuestResolutionSweeper } from './quest-resolution.sweeper';
import { ResolutionLoader } from './resolution-loader.service';
import { RescueResolutionService } from './rescue-resolution.service';
import { QuestResolutionSchedulingModule } from './scheduling/quest-resolution-scheduling.module';

// esiti delle missioni (D-21): nessun change stream qui (i processor test non ne aprono); porte sostituibili via DI
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: User.name, schema: UserSchema },
            { name: City.name, schema: CitySchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
        EconomyModule,
        PushModule,
        CharacterArchiveModule,
        QuestResolutionSchedulingModule,
        // avvii mancati recuperati dallo sweep (utente 2026-10-25)
        PartyModule,
        BullModule.registerQueue({ name: SPELL_RECOVERY_QUEUE }),
    ],
    providers: [
        { provide: Clock, useClass: SystemClock },
        { provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS },
        { provide: CombatResolver, useClass: PlaceholderCombatResolver },
        { provide: ChanceSource, useClass: MathChanceSource },
        OutcomeWriter,
        ResolutionLoader,
        BossResolutionService,
        RescueResolutionService,
        QuestResolutionService,
        QuestResolutionProcessor,
        questConfigProvider,
        QuestResolutionSweeper,
        GmCompletionService,
    ],
    exports: [
        OutcomeWriter,
        QuestResolutionService,
        QuestResolutionSweeper,
        GmCompletionService,
    ],
})
export class QuestOutcomesModule {}
