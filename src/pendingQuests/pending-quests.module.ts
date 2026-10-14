import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthzModule } from 'src/authz/authz.module';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { PendingQuestsResolver } from './pending-quests.resolver';
import { PendingQuestsService } from './pending-quests.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
        AuthzModule,
    ],
    providers: [PendingQuestsService, PendingQuestsResolver],
    exports: [PendingQuestsService],
})
export class PendingQuestsModule {}
