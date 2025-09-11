import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EquipmentItem } from '../equipment-item.model';
import { LootItem } from '../loot-item.model';

@ObjectType()
@Schema({ _id: false })
export class AssetQuantity {
    @Field(() => String)
    @Prop({ type: Types.ObjectId, refPath: 'itemType' })
    item: EquipmentItem | LootItem;

    @Field(() => Int)
    @Prop({ type: Number })
    quantity: number;
}

export type AssetQuantityDocument = AssetQuantity & Document;
export const AssetQuantitySchema = SchemaFactory.createForClass(AssetQuantity);


@InputType()
export class AssetQuantityInput {
    @Field(() => ID, { nullable: true })
    item?: string | null;

    @Field(() => Int)
    quantity: number;
}

