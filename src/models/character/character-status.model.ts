import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Coins, CoinsInput, CoinsSchema } from '../common/coins.model';
import { InjuryType } from '../enums/injury-type.enum';
import { TitleType } from '../enums/title-type.enum';
import { Spell, SpellInput } from '../spell.model';
import { LatLng, LatLngInput, LatLngSchema } from '../common/lat-lng.model';

@ObjectType()
@Schema({ _id: false })
export class CharacterStatus {
    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    xp: number;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    level: number;

    @Field(() => LatLng)
    @Prop({ type: LatLngSchema })
    location: LatLng;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType) })
    title: TitleType;

    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    injuries: InjuryType[];

    @Field(() => [Spell])
    @Prop({ type: [Types.ObjectId], ref: Spell.name, default: [] })
    spells: Spell[];

    @Field(() => Coins)
    @Prop({ type: CoinsSchema })
    coins: Coins;

    @Field(() => Int)
    @Prop({ type: Number })
    currentLifePoints: number;

    @Field(() => Int)
    @Prop({ type: Number })
    maxLifePoints: number;
}

export type CharacterStatusDocument = CharacterStatus & Document;
export const CharacterStatusSchema = SchemaFactory.createForClass(CharacterStatus);


@InputType()
export class CharacterStatusInput {
    @Field(() => Int, { nullable: true })
    xp?: number;

    @Field(() => Int, { nullable: true })
    level?: number;

    @Field(() => LatLngInput)
    location: LatLngInput;

    @Field(() => String, { nullable: true })
    title?: TitleType;

    @Field(() => [InjuryType])
    injuries: InjuryType[];

    @Field(() => [ID])
    spells: string[];

    @Field(() => CoinsInput)
    coins: CoinsInput;

    @Field(() => Int, { nullable: true })
    currentLifePoints?: number;

    @Field(() => Int, { nullable: true })
    maxLifePoints?: number;
}

