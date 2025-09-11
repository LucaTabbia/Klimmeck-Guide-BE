import { Field, ID, InterfaceType } from '@nestjs/graphql';
import { Coins } from '../common/coins.model';
import { RarityType } from '../enums/rarity-type.enum';

@InterfaceType()
export abstract class AssetItem {
    @Field(() => ID)
    id: string;

    @Field(() => String, { nullable: true })
    name?: string;

    @Field(() => String)
    itemType: string;

    @Field(() => Coins, { nullable: true })
    sellPrice?: Coins;

    @Field(() => Coins, { nullable: true })
    buyPrice?: Coins;

    @Field(() => String, { nullable: true })
    rarity?: RarityType;
}

