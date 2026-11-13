import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { User, UserSchema } from 'src/models/user.model';

// senza il modulo degli utenti: nessun change stream degli utenti nei moduli degli esiti (RESEARCH Q4)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
    ],
    providers: [CharacterArchiver],
    exports: [CharacterArchiver],
})
export class CharacterArchiveModule {}
