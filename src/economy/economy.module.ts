import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogPricesReader } from 'src/economy/trade/catalog-prices.reader';
import { ShopTransactionService } from 'src/economy/trade/shop-transaction.service';
import { WalletService } from 'src/economy/wallet.service';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { User, UserSchema } from 'src/models/user.model';

// unico scrittore dei saldi (04 D-04): coins del personaggio e twitchPoints dell'utente; il catalogo è solo letto per i prezzi
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
            { name: User.name, schema: UserSchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
        ]),
    ],
    providers: [WalletService, CatalogPricesReader, ShopTransactionService],
    exports: [WalletService, ShopTransactionService],
})
export class EconomyModule {}
