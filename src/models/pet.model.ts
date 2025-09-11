import { ObjectType, Field, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DamagesSchema, Damages, DamagesInput } from './common/damages.model';
import { CoinsSchema, Coins, CoinsInput } from './common/coins.model';

@ObjectType()
@Schema()
export class Pet {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ type: String, default: null })
    name: string;

    @Field(() => Damages)
    @Prop({ type: DamagesSchema, default: null })
    damages: Damages;

    @Field(() => Coins)
    @Prop({ type: CoinsSchema, default: null })
    buyPrice: Coins;

    @Field(() => Coins)
    @Prop({ type: CoinsSchema, default: null })
    sellPrice: Coins;

    @Field(() => Int)
    @Prop({ type: Number, default: null })
    xp: number;

    @Field(() => Int)
    @Prop({ type: Number, default: null })
    maxXp: number;

    @Field(() => Int)
    @Prop({ type: Number, default: null })
    currentLifePoints: number;

    @Field(() => Int)
    @Prop({ type: Number, default: null })
    maxLifePoints: number;

    @Field(() => String)
    @Prop({ type: String, default: null })
    imagePath: string;
}

export type PetDocument = Pet & Document;
export const PetSchema = SchemaFactory.createForClass(Pet);

@InputType()
export class PetInput {
    @Field(() => ID, { nullable: true })
    id?: string;

    @Field(() => String, { nullable: true })
    name?: string;

    @Field(() => DamagesInput, { nullable: true })
    damages?: DamagesInput;

    @Field(() => CoinsInput, { nullable: true })
    buyPrice?: CoinsInput;

    @Field(() => CoinsInput, { nullable: true })
    sellPrice?: CoinsInput;

    @Field(() => Int, { nullable: true })
    xp?: number;

    @Field(() => Int, { nullable: true })
    maxXp?: number;

    @Field(() => Int, { nullable: true })
    currentLifePoints?: number;

    @Field(() => Int, { nullable: true })
    maxLifePoints?: number;

    @Field(() => String, { nullable: true })
    imagePath?: string;
}

