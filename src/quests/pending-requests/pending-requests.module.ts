import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { QuestResultsReadModule } from 'src/quests/results/quest-results-read.module';
import { ArchivedCharacterQueueRefresher } from './archived-character-queue.refresher';
import { PendingRequestsPublisher } from './pending-requests.publisher';
import { PendingRequestsResolver } from './pending-requests.resolver';
import { PendingRequestsService } from './pending-requests.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: User.name, schema: UserSchema },
        ]),
        AuthzModule,
        QuestOutcomesModule,
        QuestResultsReadModule,
    ],
    providers: [
        PendingRequestsService,
        PendingRequestsPublisher,
        ArchivedCharacterQueueRefresher,
        PendingRequestsResolver,
    ],
    exports: [PendingRequestsService],
})
export class PendingRequestsModule {}
