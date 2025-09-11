import { ObjectType, Field, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BaseDamage, BaseDamageInput, BaseDamageSchema } from './base-damage.model';
import { EnergyDamage, EnergyDamageInput, EnergyDamageSchema } from './energy-damage';

@ObjectType()
@Schema({ _id: false })
export class Damages {
    @Field(() => [BaseDamage])
    @Prop({ type: [BaseDamageSchema], default: [] })
    base: BaseDamage[];

    @Field(() => [EnergyDamage])
    @Prop({ type: [EnergyDamageSchema], default: [] })
    energy: EnergyDamage[];
}

export type DamagesDocument = Damages & Document;
export const DamagesSchema = SchemaFactory.createForClass(Damages);



@InputType()
export class DamagesInput {
    @Field(() => [BaseDamageInput], { nullable: true })
    base?: BaseDamageInput[];

    @Field(() => [EnergyDamageInput], { nullable: true })
    energy?: EnergyDamageInput[];
}
