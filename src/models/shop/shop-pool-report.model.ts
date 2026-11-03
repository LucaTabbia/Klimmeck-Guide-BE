import { Field, ID, ObjectType } from '@nestjs/graphql';
import { CitySize } from '../enums/city-size.enum';

@ObjectType()
export class ShopPoolReportItem {
    @Field(() => ID)
    id: string;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    rarity: string | null;
}

// una città con il pool fuori regola: stesso contenuto delle WARN al boot (D-06)
@ObjectType()
export class ShopPoolReportEntry {
    @Field(() => ID)
    cityId: string;

    @Field(() => String)
    cityName: string;

    @Field(() => CitySize)
    size: CitySize;

    @Field(() => Boolean)
    emptyPool: boolean;

    @Field(() => [ShopPoolReportItem])
    outOfSize: ShopPoolReportItem[];

    @Field(() => [ShopPoolReportItem])
    vetoed: ShopPoolReportItem[];

    @Field(() => [ID])
    missing: string[];
}
