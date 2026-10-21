import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { travelConfigProvider } from 'src/config/travel-config';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { User, UserSchema } from 'src/models/user.model';
import { PushModule } from 'src/push/push.module';
import { TravelCompletionService } from './travel-completion.service';

// ciclo di vita del viaggio: completamento, sweep, push (D-12..D-14); montato in AppModule da 08-10
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: User.name, schema: UserSchema },
        ]),
        PushModule,
    ],
    providers: [
        travelConfigProvider,
        { provide: Clock, useClass: SystemClock },
        TravelCompletionService,
    ],
    exports: [TravelCompletionService],
})
export class TravelModule {}
