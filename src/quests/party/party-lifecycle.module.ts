import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { AuthzModule } from 'src/authz/authz.module';
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
import { PushModule } from 'src/push/push.module';
import { PartyAbandonService } from './party-abandon.service';
import { PartyModule } from './party.module';
import { PartyTimeoutService } from './party-timeout.service';
import { PartyResolver } from './party.resolver';

// ciclo di vita del party (utente 2026-10-25): abbandono durante l'attesa, scioglimento dopo 24 ore; il push resta qui, fuori da PartyModule
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: User.name, schema: UserSchema },
        ]),
        PartyModule,
        PushModule,
        // AuthzModule serve al guard owner-only del resolver (07 D-11)
        AuthzModule,
    ],
    providers: [
        PartyAbandonService,
        PartyTimeoutService,
        PartyResolver,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [PartyTimeoutService],
})
export class PartyLifecycleModule {}
