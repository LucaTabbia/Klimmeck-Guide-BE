import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Coins } from '../common/coins.model';
import { RarityType } from '../enums/rarity-type.enum';
import { Prop, Schema } from '@nestjs/mongoose';


@ObjectType()
@Schema()
export abstract class AssetItem {
    @Field(() => ID)
    id: string;

    @Field(() => String, { nullable: true })
    @Prop({ type: String })
    name?: string;

    @Field(() => String)
    @Prop({ type: String })
    itemType: string;

    @Field(() => Coins, { nullable: true })
    @Prop({ type: Coins })
    sellPrice?: Coins;

    @Field(() => Coins, { nullable: true })
    @Prop({ type: Coins })
    buyPrice?: Coins;

    @Field(() => String, { nullable: true })
    @Prop({ type: String, enum: Object.values(RarityType) })
    rarity?: RarityType;
}

