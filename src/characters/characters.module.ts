import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
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
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    QUEUE_CALL_TIMEOUT,
    QUEUE_CALL_TIMEOUT_MS,
} from 'src/queues/queue-call-timeout';
import { CharacterUpdatesPublisher } from './character-updates.publisher';
import { CharactersResolver } from './characters.resolver';
import { PendingQuestStartPublisher } from './pending-quest-start.publisher';
import { CharactersService } from './characters.service';
import { SPELL_RECOVERY_QUEUE } from './spells/spell-recovery-queue';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Spell.name, schema: SpellSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Quest.name, schema: QuestSchema },
        ]),
        BullModule.registerQueue({ name: SPELL_RECOVERY_QUEUE }),
        AuthzModule,
        EconomyModule,
    ],
    providers: [
        CharactersService,
        CharactersResolver,
        CharacterUpdatesPublisher,
        PendingQuestStartPublisher,
        { provide: Clock, useClass: SystemClock },
        { provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS },
    ],
    exports: [CharactersService, CharacterUpdatesPublisher],
})
export class CharactersModule {}
