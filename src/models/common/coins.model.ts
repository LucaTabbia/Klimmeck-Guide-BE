import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsInt, Min } from 'class-validator';
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
    @IsInt()
    @Min(0)
    gold: number;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    silver: number;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    copper: number;
}
