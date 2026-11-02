import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { CityShop } from 'src/models/shop/city-shop.model';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';
import { CityShopService } from './city-shop.service';

// autenticata dal guard globale, non owner-aware: i pool non sono segreti, il guard autorevole è doTransaction (D-18, D-19)
@Resolver()
export class CityShopResolver {
    constructor(private readonly cityShops: CityShopService) {}

    @Query(() => CityShop)
    async cityShop(
        @Args('cityId', { type: () => ID }, ObjectIdPipe) cityId: string,
    ): Promise<CityShop> {
        return this.cityShops.read(cityId);
    }
}
