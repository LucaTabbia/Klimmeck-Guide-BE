import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { MissionLockReader } from './mission-lock.reader';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
    ],
    providers: [MissionLockReader],
    exports: [MissionLockReader],
})
export class MissionLockModule {}
