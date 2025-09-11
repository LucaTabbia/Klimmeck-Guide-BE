import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from 'src/models/character/character.model';
import { CharactersResolver } from './characters.resolver';
import { CharactersService } from './characters.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
        ]),
    ],
    providers: [CharactersService, CharactersResolver],
    exports: [CharactersService],
})
export class CharactersModule { }
