import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EnergyType } from '../enums/energy-type.enum';

@ObjectType()
@Schema({ _id: false })
export class EnergyDamage {
    @Field(() => String)
    @Prop({ type: String, enum: Object.values(EnergyType) })
    type: EnergyType;

    @Field(() => Int)
    @Prop({ type: Number })
    power: number;
}

export type EnergyDamageDocument = EnergyDamage & Document;
export const EnergyDamageSchema = SchemaFactory.createForClass(EnergyDamage);


@InputType()
export class EnergyDamageInput {
    @Field(() => EnergyType)
    type: EnergyType;

    @Field(() => Int)
    power: number;
}