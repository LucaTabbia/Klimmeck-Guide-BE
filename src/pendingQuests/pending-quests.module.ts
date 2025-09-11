import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PendingQuestsResolver } from './pending-quests.resolver';
import { PendingQuestsService } from './pending-quests.service';
import { PendingQuest, PendingQuestSchema } from 'src/models/pending-quest.model';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: PendingQuest.name, schema: PendingQuestSchema },
        ]),
    ],
    providers: [PendingQuestsService, PendingQuestsResolver],
    exports: [PendingQuestsService],
})
export class PendingQuestsModule { }
