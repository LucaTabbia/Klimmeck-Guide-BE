import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestsResolver } from './quests.resolver';
import { QuestsService } from './quests.service';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
        ]),
    ],
    providers: [QuestsService, QuestsResolver],
    exports: [QuestsService],
})
export class QuestsModule { }
