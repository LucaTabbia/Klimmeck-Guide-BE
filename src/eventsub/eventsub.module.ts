import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { eventSubConfigProvider } from 'src/config/eventsub-config';
import { EconomyModule } from 'src/economy/economy.module';
import { EventSubMessageIndexVerifier } from 'src/eventsub/eventsub-message-index.verifier';
import {
    EventSubMessage,
    EventSubMessageSchema,
} from 'src/eventsub/eventsub-message.model';
import { EventSubStartupReporter } from 'src/eventsub/eventsub-startup.reporter';
import { EventSubWebhookService } from 'src/eventsub/eventsub-webhook.service';
import { EventSubController } from 'src/eventsub/eventsub.controller';
import { HttpTwitchHelixClient } from 'src/eventsub/helix/http-twitch-helix.client';
import { TwitchAppTokenCache } from 'src/eventsub/helix/twitch-app-token.cache';
import { TwitchHelixClient } from 'src/eventsub/helix/twitch-helix.client';
import { PointsCreditService } from 'src/eventsub/points-credit.service';
import { StreamOnlineRecorder } from 'src/eventsub/stream-online.recorder';
import { EventSubSubscriptionManager } from 'src/eventsub/subscriptions/eventsub-subscription.manager';
import { User, UserSchema } from 'src/models/user.model';
import { PushModule } from 'src/push/push.module';

// modulo foglia: User registrato localmente per il lookup twitchId, senza trascinare UsersModule (change stream)
@Module({
    imports: [
        EconomyModule,
        PushModule,
        MongooseModule.forFeature([
            { name: EventSubMessage.name, schema: EventSubMessageSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [EventSubController],
    providers: [
        eventSubConfigProvider,
        { provide: Clock, useClass: SystemClock },
        TwitchAppTokenCache,
        { provide: TwitchHelixClient, useClass: HttpTwitchHelixClient },
        EventSubMessageIndexVerifier,
        PointsCreditService,
        StreamOnlineRecorder,
        EventSubSubscriptionManager,
        EventSubWebhookService,
        EventSubStartupReporter,
    ],
})
export class EventSubModule {}
