import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EconomyModule } from 'src/economy/economy.module';
import { LoreGeographyModule } from 'src/lore/lore-geography.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { User, UserSchema } from 'src/models/user.model';
import { StartedQuestCanceller } from './started-quest-canceller';

// annullamento di una quest cominciata (Phase 26 D-13, D-26): fuori da AppModule, lo importa solo la cancellazione dell'account
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Quest.name, schema: QuestSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: City.name, schema: CitySchema },
            { name: User.name, schema: UserSchema },
        ]),
        LoreGeographyModule,
        EconomyModule,
    ],
    providers: [StartedQuestCanceller],
    exports: [StartedQuestCanceller],
})
export class StartedQuestCancelModule {}
