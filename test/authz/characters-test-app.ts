import { getQueueToken } from '@nestjs/bull';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { AuthzModule } from 'src/authz/authz.module';
import { CharacterUpdatesPublisher } from 'src/characters/character-updates.publisher';
import { CharactersResolver } from 'src/characters/characters.resolver';
import { CharactersService } from 'src/characters/characters.service';
import { PendingQuestStartPublisher } from 'src/characters/pending-quest-start.publisher';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { EconomyModule } from 'src/economy/economy.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
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
import {
    AuthTestApp,
    AuthTestAppOptions,
    createAuthTestApp,
} from '../auth/auth-test-app';

// CharactersService/Resolver senza CharactersModule (che registra Bull): nessun Redis nei test (Pitfall 8)
export async function createCharactersTestApp(
    options: AuthTestAppOptions = {},
): Promise<AuthTestApp> {
    return createAuthTestApp({
        ...options,
        imports: [
            MongooseModule.forFeature([
                { name: Character.name, schema: CharacterSchema },
                { name: Spell.name, schema: SpellSchema },
                { name: EquipmentItem.name, schema: EquipmentItemSchema },
                { name: LootItem.name, schema: LootItemSchema },
                { name: PointOfInterest.name, schema: PointOfInterestSchema },
                { name: PendingQuest.name, schema: PendingQuestSchema },
                { name: Quest.name, schema: QuestSchema },
            ]),
            EconomyModule,
            AuthzModule,
            ...(options.imports ?? []),
        ],
        providers: [
            CharactersService,
            CharactersResolver,
            CharacterUpdatesPublisher,
            PendingQuestStartPublisher,
            {
                provide: getQueueToken(SPELL_RECOVERY_QUEUE),
                useValue: { add: jest.fn() },
            },
            { provide: Clock, useClass: SystemClock },
            { provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS },
            ...(options.providers ?? []),
        ],
    });
}
