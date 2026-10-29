import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { MongoModule } from './mongo/mongo.module';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { UsersModule } from './users/users.module';
import { CharactersModule } from './characters/characters.module';
import { SpellRecoveryModule } from './characters/spells/spell-recovery.module';
import { CharacterCreationModule } from './characters/creation/character-creation.module';
import { CharacterDeletionModule } from './characters/deletion/character-deletion.module';
import { CitiesModule } from './cities/cities.module';
import { EnemiesModule } from './enemies/enemies.module';
import { EquipmentItemsModule } from './equipmentItems/equipment-items.module';
import { LootItemsModule } from './lootItems/loot-items.module';
import { LoreModule } from './lore/lore.module';
import { PendingQuestsModule } from './pendingQuests/pending-quests.module';
import { PetsModule } from './pets/pets.module';
import { QuestAcceptanceModule } from './quests/acceptance/quest-acceptance.module';
import { QuestsModule } from './quests/quests.module';
import { TravelModule } from './travel/travel.module';
import { QuestOutcomesModule } from './quests/outcomes/quest-outcomes.module';
import { QuestResultsModule } from './quests/results/quest-results.module';
import { PartyLifecycleModule } from './quests/party/party-lifecycle.module';
import { PendingRequestsModule } from './quests/pending-requests/pending-requests.module';
import { SpellsModule } from './spells/spells.module';
import { ServerTimeModule } from './time/server-time.module';
import { AppService } from './app.service';
import mongoose from 'mongoose';
import { idTransformPlugin } from './mongoose.plugins';
import { CloudinaryModule } from './rest/cloudinary/cloudinary.module';
import { PubSubModule } from './pubsub.module';
import { RoadsModule } from './roads/roads.module';
import { PointOfInterestModule } from './pointsOfInterest/point-of-interest.module';
import { PushModule } from './push/push.module';
import { EventSubModule } from './eventsub/eventsub.module';
import { validateEnv } from './config/env.validation';
import { RuntimeConfigModule } from './config/runtime-config.module';
import { AuthModule } from './auth/auth.module';
import { AuthzModule } from './authz/authz.module';
import { ValidationModule } from './validation/validation.module';
import { WsConnectionAuthenticator } from './auth/ws/ws-connection-authenticator';
import { createGraphQLOptions } from './graphql/graphql-options.factory';

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: '.env',
            isGlobal: true,
            validate: validateEnv,
        }),
        RuntimeConfigModule,
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                redis: {
                    host: config.get<string>('REDIS_HOST', 'localhost'),
                    port: config.get<number>('REDIS_PORT', 6379),
                },
            }),
        }),
        MongoModule,
        PubSubModule,
        AuthModule,
        AuthzModule,
        ValidationModule,
        GraphQLModule.forRootAsync<ApolloDriverConfig>({
            driver: ApolloDriver,
            imports: [AuthModule],
            inject: [WsConnectionAuthenticator],
            useFactory: (
                wsConnectionAuthenticator: WsConnectionAuthenticator,
            ) =>
                createGraphQLOptions(
                    wsConnectionAuthenticator,
                    join(process.cwd(), 'src/schema.gql'),
                ),
        }),
        UsersModule,
        CharactersModule,
        SpellRecoveryModule,
        CharacterCreationModule,
        CharacterDeletionModule,
        CitiesModule,
        EnemiesModule,
        EquipmentItemsModule,
        LootItemsModule,
        LoreModule,
        PendingQuestsModule,
        PetsModule,
        QuestsModule,
        QuestAcceptanceModule,
        TravelModule,
        QuestOutcomesModule,
        PartyLifecycleModule,
        QuestResultsModule,
        PendingRequestsModule,
        ServerTimeModule,
        PushModule,
        EventSubModule,
        SpellsModule,
        RoadsModule,
        PointOfInterestModule,
        CloudinaryModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {
    constructor() {
        mongoose.plugin(idTransformPlugin);
    }
}
