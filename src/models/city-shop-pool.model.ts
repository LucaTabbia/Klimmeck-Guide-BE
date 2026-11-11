import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

// solo Mongoose: sul filo il negozio è CityShop (D-10); ogni lista resta assente finché la cura a DB non la scrive, e una lista vuota resta vuota (D-03, D-22)
@Schema({ _id: false })
export class CityShopPool {
    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'EquipmentItem' }],
        default: undefined,
    })
    equipment?: Types.ObjectId[];

    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'LootItem' }],
        default: undefined,
    })
    loot?: Types.ObjectId[];

    @Prop({
        type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Pet' }],
        default: undefined,
    })
    pets?: Types.ObjectId[];
}

export const CityShopPoolSchema = SchemaFactory.createForClass(CityShopPool);
