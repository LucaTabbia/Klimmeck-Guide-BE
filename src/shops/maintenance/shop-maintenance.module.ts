import { Module } from '@nestjs/common';
import { ShopsModule } from '../shops.module';
import { ShopBoot } from './shop-boot';

// importato SOLO da AppModule: il report al boot non gira negli harness di test (D-24)
@Module({
    imports: [ShopsModule],
    providers: [ShopBoot],
})
export class ShopMaintenanceModule {}
