import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DamageType } from '../enums/damage-type.enum';

@ObjectType()
@Schema({ _id: false })
export class BaseDamage {
    @Field(() => String)
    @Prop({ type: String, enum: Object.values(DamageType) })
    type: DamageType;

    @Field(() => Int)
    @Prop({ type: Number })
    power: number;
}

export type BaseDamageDocument = BaseDamage & Document;
export const BaseDamageSchema = SchemaFactory.createForClass(BaseDamage);


@InputType()
export class BaseDamageInput {
    @Field(() => String)
    type: DamageType;

    @Field(() => Int)
    power: number;
}

