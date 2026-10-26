import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import {
    AssetQuantity,
    AssetQuantityInput,
    assetQuantitySchemaAt,
} from '../common/asset-quantity.model';
import { Coins, CoinsInput, CoinsSchema } from '../common/coins.model';
import { Spell } from '../spell.model';

@ObjectType()
@Schema({ _id: false })
export class QuestPrizes {
    @Field(() => Coins, { nullable: true })
    @Prop({ type: CoinsSchema, default: null })
    prizeCoins?: Coins;

    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    xpPrize?: number | null;

    // path assoluti legati ai nomi dei campi di Quest (requirements, prizes): rinominarli richiede di aggiornare anche questi
    @Field(() => AssetQuantity, { nullable: true })
    @Prop({ type: assetQuantitySchemaAt('prizes.prizeItem') })
    prizeItem?: AssetQuantity | null;

    @Field(() => [AssetQuantity])
    @Prop({ type: [assetQuantitySchemaAt('prizes.randomLoot')] })
    randomLoot: AssetQuantity[];

    // magia insegnata da una study (D-17): il catalogo la mette solo sulle study di Valantar; orfano = null sul filo
    @Field(() => Spell, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        default: null,
    })
    spell?: Types.ObjectId | Spell | null;
}

export type QuestPrizesDocument = QuestPrizes & Document;
export const QuestPrizesSchema = SchemaFactory.createForClass(QuestPrizes);

@InputType()
export class QuestPrizesInput {
    @Field(() => CoinsInput, { nullable: true })
    prizeCoins?: CoinsInput;

    @Field(() => Int, { nullable: true })
    xpPrize?: number | null;

    @Field(() => ID, { nullable: true })
    prizeItem?: string | null;

    @Field(() => [AssetQuantityInput], { nullable: true })
    randomLoot?: AssetQuantityInput[];

    @Field(() => ID, { nullable: true })
    spell?: string | null;
}
