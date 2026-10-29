import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { EquipmentItem } from '../equipment-item.model';
import { LootItem } from '../loot-item.model';
import { ItemUnion } from './item.union';

export type ItemReferenceType = 'EquipmentItem' | 'LootItem';

@ObjectType()
@Schema({ _id: false })
export class AssetQuantity {
    @Prop({ type: String, required: true, enum: ['EquipmentItem', 'LootItem'] })
    itemType: ItemReferenceType;

    @Field(() => ItemUnion)
    @Prop({ type: Types.ObjectId, refPath: 'itemType' })
    item: EquipmentItem | LootItem;

    @Field(() => Int)
    @Prop({ type: Number })
    quantity: number;
}

export type AssetQuantityDocument = AssetQuantity & Document;
export const AssetQuantitySchema = SchemaFactory.createForClass(AssetQuantity);

// il refPath relativo non risolve negli array di sotto-documenti (probe Mongoose 8.18.1): ogni uso nel catalogo quest dichiara il proprio path assoluto
export function assetQuantitySchemaAt(path: string): MongooseSchema {
    const schema = AssetQuantitySchema.clone();
    schema.path('item').options.refPath = `${path}.itemType`;
    return schema;
}

@InputType()
export class AssetQuantityInput {
    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsObjectIdHex()
    item?: string | null;

    // lo 0 resta INVALID_QUANTITY del dominio (C5)
    @Field(() => Int)
    @IsInt()
    @Min(0)
    quantity: number;
}
