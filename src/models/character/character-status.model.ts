import { ObjectType, Field, Int, InputType, ID, Float } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Coins, CoinsInput, CoinsSchema } from '../common/coins.model';
import { InjuryType } from '../enums/injury-type.enum';
import { TitleType } from '../enums/title-type.enum';
import { Spell } from '../spell.model';
import { PointOfInterest } from '../point-of-interest.model';

@ObjectType()
@Schema({ _id: false })
export class CharacterStatus {
    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    xp: number;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    level: number;

    @Field(() => PointOfInterest)
    @Prop({ type: Types.ObjectId, ref: PointOfInterest.name, required: true })
    location: Types.ObjectId | PointOfInterest;

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

    @Field(() => Int)
    maxActiveSpells: number;
}

export type CharacterStatusDocument = CharacterStatus & Document;
export const CharacterStatusSchema = (() => {
    const schema = SchemaFactory.createForClass(CharacterStatus);
    schema.virtual('maxActiveSpells').get(function (this: CharacterStatus) {
        const xp = this.xp ?? 0;
        if (xp < 20000) return 0;
        if (xp < 25000) return 1;
        if (xp < 30000) return 2;
        if (xp < 40000) return 3;
        return 4;
    });

    return schema;
})();

@InputType()
export class CharacterStatusInput {
    @Field(() => Int, { nullable: true })
    xp?: number;

    @Field(() => Int, { nullable: true })
    level?: number;

    @Field(() => ID)
    location: string;

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

