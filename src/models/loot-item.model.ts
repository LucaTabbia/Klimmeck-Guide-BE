import { ObjectType, Field, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AssetItem } from './interfaces/asset-item.model';
import { EffectType } from './enums/effect-type.enum';

@ObjectType({ implements: AssetItem })
@Schema()
export class LootItem extends AssetItem {
    @Field(() => Int)
    @Prop({ type: Number })
    power: number;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(EffectType) })
    effect: EffectType;
}

export type LootItemDocument = LootItem & Document;
export const LootItemSchema = SchemaFactory.createForClass(LootItem);

@InputType()
export class LootItemInput {
    @Field(() => String, { nullable: true })
    id?: string | null;

    @Field(() => String)
    name: string;

    @Field(() => String, { nullable: true })
    description?: string | null;

    @Field(() => String, { nullable: true })
    image?: string | null;

    @Field(() => String, { nullable: true })
    rarity?: string | null;

    @Field(() => Number, { nullable: true })
    buyPrice?: number | null;

    @Field(() => Number, { nullable: true })
    sellPrice?: number | null;

    @Field(() => Int)
    power: number;

    @Field(() => EffectType)
    effect: EffectType;
}

