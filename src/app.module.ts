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
import { CharacterCreationModule } from './characters/creation/character-creation.module';
import { CitiesModule } from './cities/cities.module';
import { EnemiesModule } from './enemies/enemies.module';
import { EquipmentItemsModule } from './equipmentItems/equipment-items.module';
import { LootItemsModule } from './lootItems/loot-items.module';
import { LoreModule } from './lore/lore.module';
import { PendingQuestsModule } from './pendingQuests/pending-quests.module';
import { PetsModule } from './pets/pets.module';
import { QuestsModule } from './quests/quests.module';
import { SpellsModule } from './spells/spells.module';
import { AppService } from './app.service';
import mongoose from 'mongoose';
import { idTransformPlugin } from './mongoose.plugins';
import { CloudinaryModule } from './rest/cloudinary/cloudinary.module';
import { PubSubModule } from './pubsub.module';
import { RoadsModule } from './roads/roads.module';
import { PointOfInterestModule } from './pointsOfInterest/point-of-interest.module';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { WsConnectionAuthenticator } from './auth/ws/ws-connection-authenticator';
import { createGraphQLOptions } from './graphql/graphql-options.factory';

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: '.env',
            isGlobal: true,
            validate: validateEnv,
        }),
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
        CharacterCreationModule,
        CitiesModule,
        EnemiesModule,
        EquipmentItemsModule,
        LootItemsModule,
        LoreModule,
        PendingQuestsModule,
        PetsModule,
        QuestsModule,
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
