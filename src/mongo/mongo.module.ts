import { Global, Module } from "@nestjs/common";

import { MongooseModule } from "@nestjs/mongoose";

import * as process from "process";
import { PubSub } from "graphql-subscriptions";
import { MongoService } from "./mongo.service";
import { ConfigService } from "@nestjs/config";
import { User, UserSchema } from "src/models/user.model";
import { Spell, SpellSchema } from "src/models/spell.model";
import { Character, CharacterSchema } from "src/models/character/character.model";
import { City, CitySchema } from "src/models/city.model";
import { Enemy, EnemySchema } from "src/models/enemy.model";
import { EquipmentItem, EquipmentItemSchema } from "src/models/equipment-item.model";
import { LootItem, LootItemSchema } from "src/models/loot-item.model";
import { Lore, LoreSchema } from "src/models/lore.model";
import { PendingQuest, PendingQuestSchema } from "src/models/pending-quest.model";
import { Pet, PetSchema } from "src/models/pet.model";
import { Quest, QuestSchema } from "src/models/quest/quest.model";


@Global()
@Module({
    imports: [
        MongooseModule.forRootAsync({
            inject: [ConfigService],
            useFactory: async () => ({
                uri: process.env.MONGO_URI,
                dbName: process.env.DB_NAME,
            }),
        }),
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: City.name, schema: CitySchema },
            { name: Enemy.name, schema: EnemySchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Lore.name, schema: LoreSchema },
            { name: PendingQuest.name, schema: PendingQuestSchema },
            { name: Pet.name, schema: PetSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: Spell.name, schema: SpellSchema },
        ]),
    ],

    controllers: [],
    providers: [
        MongoService,
        {
            provide: "PUB_SUB",
            useValue: new PubSub(),
        },
    ],
    exports: [MongooseModule, "PUB_SUB"],
})
export class MongoModule { }
