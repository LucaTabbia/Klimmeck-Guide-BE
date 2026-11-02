import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CitiesModule } from 'src/cities/cities.module';
import { City, CitySchema } from 'src/models/city.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { CityShopResolver } from './city-shop.resolver';
import { CityShopService } from './city-shop.service';
import { ShopPoolReportService } from './shop-pool-report.service';

// servizi dei negozi senza hook di boot: importabile dagli harness (la manutenzione vive in ShopMaintenanceModule)
@Module({
    imports: [
        CitiesModule,
        MongooseModule.forFeature([
            { name: City.name, schema: CitySchema },
            { name: EquipmentItem.name, schema: EquipmentItemSchema },
            { name: LootItem.name, schema: LootItemSchema },
            { name: Pet.name, schema: PetSchema },
        ]),
    ],
    providers: [ShopPoolReportService, CityShopService, CityShopResolver],
    exports: [ShopPoolReportService, MongooseModule],
})
export class ShopsModule {}
