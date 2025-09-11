import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AssetItem } from '../interfaces/asset-item.model';
import { AssetQuantity, AssetQuantityInput, AssetQuantitySchema } from '../common/asset-quantity.model';
import { Coins, CoinsInput, CoinsSchema } from '../common/coins.model';

@ObjectType()
@Schema({ _id: false })
export class QuestPrizes {
    @Field(() => Coins)
    @Prop({ type: CoinsSchema })
    prizeCoins: Coins;

    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    xpPrize?: number | null;

    @Field(() => AssetItem, { nullable: true })
    @Prop({ type: Types.ObjectId, refPath: 'prizeItem.itemType', default: null })
    prizeItem?: AssetItem | null;

    @Field(() => [AssetQuantity])
    @Prop({ type: [AssetQuantitySchema] })
    randomLoot: AssetQuantity[];
}

export type QuestPrizesDocument = QuestPrizes & Document;
export const QuestPrizesSchema = SchemaFactory.createForClass(QuestPrizes);

@InputType()
export class QuestPrizesInput {
    @Field(() => CoinsInput)
    prizeCoins: CoinsInput;

    @Field(() => Int, { nullable: true })
    xpPrize?: number | null;

    @Field(() => ID, { nullable: true })
    prizeItem?: string | null;

    @Field(() => [AssetQuantityInput], { nullable: true })
    randomLoot?: AssetQuantityInput[];
}

