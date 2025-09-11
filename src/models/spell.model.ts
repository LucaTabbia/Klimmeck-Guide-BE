import { ObjectType, Field, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UseType } from './enums/use-type.enum';
import { EnergyDamage, EnergyDamageInput, EnergyDamageSchema } from './common/energy-damage';

@ObjectType()
@Schema()
export class Spell {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ type: String })
    name: string;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(UseType) })
    useType: UseType;

    @Field(() => EnergyDamage)
    @Prop({ type: EnergyDamageSchema })
    energyDamage: EnergyDamage;

    @Field(() => Int)
    @Prop({ type: Number })
    requiredLearnTime: number;

    @Field(() => Int)
    @Prop({ type: Number })
    minXpToLearn: number;

    @Field(() => Int)
    @Prop({ type: Number })
    recoveryTime: number;

    @Field(() => Int)
    @Prop({ type: Number })
    maxUsages: number;
}

export type SpellDocument = Spell & Document;
export const SpellSchema = SchemaFactory.createForClass(Spell);


@InputType()
export class SpellInput {
    @Field(() => ID, { nullable: true })
    id?: string;

    @Field(() => String)
    name: string;

    @Field(() => UseType)
    useType: UseType;

    @Field(() => EnergyDamageInput)
    energyDamage: EnergyDamageInput;

    @Field(() => Int)
    requiredLearnTime: number;

    @Field(() => Int)
    minXpToLearn: number;

    @Field(() => Int)
    recoveryTime: number;

    @Field(() => Int)
    maxUsages: number;
}

