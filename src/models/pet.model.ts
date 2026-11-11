import { ObjectType, Field, Float, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
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
    @Prop({ type: DamagesSchema, default: () => ({}) })
    attack: Damages;

    @Field(() => Damages)
    @Prop({ type: DamagesSchema, default: () => ({}) })
    defense: Damages;

    @Field(() => Coins)
    @Prop({ type: CoinsSchema, default: null })
    buyPrice: Coins;

    @Field(() => Coins)
    @Prop({ type: CoinsSchema, default: null })
    sellPrice: Coins;

    @Field(() => Int)
    @Prop({ type: Number, default: null })
    maxXp: number;

    @Field(() => Int)
    @Prop({ type: Number, default: null })
    maxLifePoints: number;

    @Field(() => String)
    @Prop({ type: String, default: null })
    imagePath: string;

    // modificatore di cavalcatura (D-08): null = non cavalcabile; velocità = 10 × modificatore, valorizzato a DB a mano
    @Field(() => Float, { nullable: true })
    @Prop({ type: Number, default: null })
    speedModifier?: number | null;

    // «mai sullo scaffale» quando false (D-05, D-07); la migrazione al boot lo valorizza dove manca (D-16)
    @Field(() => Boolean, { nullable: true })
    @Prop({ type: Boolean })
    sellable?: boolean | null;
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
    attack?: DamagesInput;

    @Field(() => DamagesInput, { nullable: true })
    defense?: DamagesInput;

    @Field(() => CoinsInput, { nullable: true })
    buyPrice?: CoinsInput;

    @Field(() => CoinsInput, { nullable: true })
    sellPrice?: CoinsInput;

    @Field(() => Int, { nullable: true })
    maxXp?: number;

    @Field(() => Int, { nullable: true })
    maxLifePoints?: number;

    @Field(() => String, { nullable: true })
    imagePath?: string;

    @Field(() => Float, { nullable: true })
    speedModifier?: number | null;
}
