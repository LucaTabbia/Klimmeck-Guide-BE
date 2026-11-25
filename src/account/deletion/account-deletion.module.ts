import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountDeletionResolver } from 'src/account/deletion/account-deletion.resolver';
import { AccountDeletionService } from 'src/account/deletion/account-deletion.service';
import { AccountEraser } from 'src/account/deletion/account-eraser';
import { AuthModule } from 'src/auth/auth.module';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    ChannelAccessCheck,
    ChannelAccessCheckSchema,
} from 'src/auth/channel-access/channel-access-check.model';
import {
    LoginTicket,
    LoginTicketSchema,
} from 'src/auth/login-ticket/login-ticket.model';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { User, UserSchema } from 'src/models/user.model';
import { PushDevice, PushDeviceSchema } from 'src/push/push-device.model';
import {
    MissionDraft,
    MissionDraftSchema,
} from 'src/quests/guided/mission-draft.model';
import { StartedQuestCancelModule } from 'src/quests/party/started-quest-cancel.module';

// una sola cancellazione per la via propria e per quella dell'oste (Phase 26 regola dura 1)
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: QuestResult.name, schema: QuestResultSchema },
            { name: MissionDraft.name, schema: MissionDraftSchema },
            { name: LoginTicket.name, schema: LoginTicketSchema },
            { name: PushDevice.name, schema: PushDeviceSchema },
            { name: ChannelAccessCheck.name, schema: ChannelAccessCheckSchema },
        ]),
        StartedQuestCancelModule,
        CharacterArchiveModule,
        AuthModule,
    ],
    providers: [
        AccountEraser,
        AccountDeletionService,
        AccountDeletionResolver,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [AccountEraser],
})
export class AccountDeletionModule {}
