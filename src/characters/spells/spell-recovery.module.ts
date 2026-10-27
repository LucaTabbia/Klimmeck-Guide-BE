import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { spellRecoveryConfigProvider } from 'src/config/spell-recovery-config';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { SPELL_RECOVERY_QUEUE } from './spell-recovery-queue';
import { SpellRecoveryProcessor } from './spell-recovery.processor';
import { SpellRecoveryService } from './spell-recovery.service';
import { SpellStateMigrator } from './spell-state.migrator';

// trigger, credito, migrazione e sweep dei recuperi: fuori da CharactersModule così gli harness delle mutation non ereditano boot hook né Bull
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
        BullModule.registerQueue({ name: SPELL_RECOVERY_QUEUE }),
    ],
    providers: [
        SpellStateMigrator,
        SpellRecoveryService,
        SpellRecoveryProcessor,
        spellRecoveryConfigProvider,
        { provide: Clock, useClass: SystemClock },
    ],
})
export class SpellRecoveryModule {}
