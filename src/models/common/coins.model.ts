import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@ObjectType()
@Schema({ _id: false })
export class Coins {
    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    gold: number;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    silver: number;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    copper: number;
}

export type CoinsDocument = Coins & Document;
export const CoinsSchema = SchemaFactory.createForClass(Coins);


@InputType()
export class CoinsInput {
    @Field(() => Int)
    gold: number;

    @Field(() => Int)
    silver: number;

    @Field(() => Int)
    copper: number;
}
