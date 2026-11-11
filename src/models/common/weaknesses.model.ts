import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { DamageType } from '../enums/damage-type.enum';
import { EnergyType } from '../enums/energy-type.enum';

@ObjectType()
@Schema({ _id: false })
export class Weaknesses {
    @Field(() => [DamageType])
    @Prop({ type: [String], enum: Object.values(DamageType), default: [] })
    base: DamageType[];

    @Field(() => [EnergyType])
    @Prop({ type: [String], enum: Object.values(EnergyType), default: [] })
    energy: EnergyType[];
}

export const WeaknessesSchema = SchemaFactory.createForClass(Weaknesses);

@InputType()
export class WeaknessesInput {
    @Field(() => [DamageType])
    base: DamageType[];

    @Field(() => [EnergyType])
    energy: EnergyType[];
}
