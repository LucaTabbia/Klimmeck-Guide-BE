import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { Character, CharacterSchema } from 'src/models/character/character.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { CharactersResolver } from './characters.resolver';
import { CharactersService } from './characters.service';
import { SpellRecoveryProcessor } from './spell-recovery.processor';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
        BullModule.registerQueue({
            name: 'spell-recovery',
        }),
    ],
    providers: [CharactersService, CharactersResolver, SpellRecoveryProcessor],
    exports: [CharactersService],
})
export class CharactersModule { }
