import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import { ItemUseResolver } from 'src/characters/items/item-use.resolver';
import { ItemUseService } from 'src/characters/items/item-use.service';
import { MissionLockModule } from 'src/characters/mission-lock/mission-lock.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { User, UserSchema } from 'src/models/user.model';

// bevuta dal Diario (Phase 18): modulo sibling della cancellazione, senza Bull
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Character.name, schema: CharacterSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Lore.name, schema: LoreSchema },
        ]),
        MissionLockModule,
    ],
    providers: [
        ItemUseService,
        ItemUseResolver,
        { provide: Clock, useClass: SystemClock },
    ],
})
export class ItemUseModule {}
