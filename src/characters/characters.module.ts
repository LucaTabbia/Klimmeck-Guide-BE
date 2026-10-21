import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
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
import { CharactersResolver } from './characters.resolver';
import { CharactersService } from './characters.service';
import { SpellRecoveryProcessor } from './spell-recovery.processor';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Spell.name, schema: SpellSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Quest.name, schema: QuestSchema },
        ]),
        BullModule.registerQueue({
            name: 'spell-recovery',
        }),
        AuthzModule,
        EconomyModule,
    ],
    providers: [CharactersService, CharactersResolver, SpellRecoveryProcessor],
    exports: [CharactersService],
})
export class CharactersModule {}
