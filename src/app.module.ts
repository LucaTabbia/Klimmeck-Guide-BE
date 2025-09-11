import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { MongoModule } from './mongo/mongo.module';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { UsersModule } from './users/users.module';
import { CharactersModule } from './characters/characters.module';
import { CitiesModule } from './cities/cities.module';
import { EnemiesModule } from './enemies/enemies.module';
import { EquipmentItemsModule } from './equipmentItems/equipment-items.module';
import { LootItemsModule } from './lootItems/loot-items.module';
import { LoreModule } from './lore/lore.module';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { PendingQuestsModule } from './pendingQuests/pending-quests.module';
import { PetsModule } from './pets/pets.module';
import { QuestsModule } from './quests/quests.module';
import { SpellsModule } from './spells/spells.module';
import { AppService } from './app.service';
import mongoose from 'mongoose';
import { idTransformPlugin } from './mongoose.plugins';
import { CloudinaryController } from './rest/cloudinary/cloudinary.controller';
import { CloudinaryModule } from './rest/cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),
    MongoModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      installSubscriptionHandlers: true,
      introspection: true,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      subscriptions: {
        "graphql-ws": true,
        "subscriptions-transport-ws": true,
      },
      path: "/api/graphql",
    }),
    UsersModule,
    CharactersModule,
    CitiesModule,
    EnemiesModule,
    EquipmentItemsModule,
    LootItemsModule,
    LoreModule,
    PendingQuestsModule,
    PetsModule,
    QuestsModule,
    SpellsModule,
    CloudinaryModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {
  constructor() {
    mongoose.plugin(idTransformPlugin);
  }
}
