import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterDeletionResolver } from 'src/characters/deletion/character-deletion.resolver';
import { CharacterDeletionService } from 'src/characters/deletion/character-deletion.service';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { User, UserSchema } from 'src/models/user.model';
import { UsersModule } from 'src/users/users.module';

// modulo sibling della creazione (03.1 D-02), senza Bull: esporta il service per la Phase 9 (morte)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            // Quest: rilascio dei posti alla cancellazione (D-30)
            { name: Quest.name, schema: QuestSchema },
        ]),
        UsersModule,
    ],
    providers: [CharacterDeletionResolver, CharacterDeletionService],
    exports: [CharacterDeletionService],
})
export class CharacterDeletionModule {}
