import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { ShopsModule } from '../shops.module';
import { OwnedPetsMigrator } from './owned-pets.migrator';
import { PetSellableMigrator } from './pet-sellable.migrator';
import { ShopBoot } from './shop-boot';
import { ShopPoolSeeder } from './shop-pool.seeder';

// importato SOLO da AppModule: gli harness di test non seminano le città delle fixture (D-24)
@Module({
    imports: [
        ShopsModule,
        MongooseModule.forFeature([
            { name: Character.name, schema: CharacterSchema },
        ]),
    ],
    providers: [
        PetSellableMigrator,
        OwnedPetsMigrator,
        ShopPoolSeeder,
        ShopBoot,
    ],
})
export class ShopMaintenanceModule {}
