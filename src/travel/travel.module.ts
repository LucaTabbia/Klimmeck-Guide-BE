import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { AuthzModule } from 'src/authz/authz.module';
import { travelConfigProvider } from 'src/config/travel-config';
import { LoreGeographyModule } from 'src/lore/lore-geography.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { User, UserSchema } from 'src/models/user.model';
import { PushModule } from 'src/push/push.module';
import { PartyModule } from 'src/quests/party/party.module';
import { TravelCompletionProcessor } from './travel-completion.processor';
import { TravelCompletionService } from './travel-completion.service';
import { TravelAdminResolver } from './travel-admin.resolver';
import { TravelPlanningModule } from './travel-planning.module';
import { TravelSweeper } from './travel-sweeper';
import { TravelResolver } from './travel.resolver';
import { TravelService } from './travel.service';

// ciclo di vita del viaggio: avvio e anteprima owner-only (D-11, D-18), teleport innkeeper (D-16), completamento, sweep, push (D-12..D-14); montato in AppModule da 08-10
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: Lore.name, schema: LoreSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: PointOfInterest.name, schema: PointOfInterestSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: User.name, schema: UserSchema },
        ]),
        AuthzModule,
        PushModule,
        TravelPlanningModule,
        // geografia della città all'arrivo e al teleport (Phase 16 D-05, D-14)
        LoreGeographyModule,
        // avvio all'arrivo (utente 2026-10-25): PartyModule accoda la scadenza, nessun ciclo con viaggio o accettazione
        PartyModule,
    ],
    providers: [
        travelConfigProvider,
        { provide: Clock, useClass: SystemClock },
        TravelCompletionService,
        TravelSweeper,
        TravelCompletionProcessor,
        TravelService,
        TravelResolver,
        TravelAdminResolver,
    ],
    exports: [TravelCompletionService, TravelSweeper, TravelService],
})
export class TravelModule {}
