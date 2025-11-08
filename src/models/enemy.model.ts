import { ObjectType, Field, Int, ID, InputType, Float } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EnergyType } from './enums/energy-type.enum';
import { DamageType } from './enums/damage-type.enum';
import { SpellSchema, Spell, SpellInput } from './spell.model';
import { Damages, DamagesInput, DamagesSchema } from './common/damages.model';
import { Lore, LoreInput } from './lore.model';
import { PoiType } from './enums/poi-type.enum';

@ObjectType()
@Schema()
export class Enemy {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ type: String })
    name: string;

    @Field(() => [PoiType])
    @Prop({ type: String, enum: Object.values(PoiType) })
    locations: PoiType[];

    @Field(() => [String])
    @Prop({ type: [String], enum: Object.values(EnergyType) })
    energyWeaknesses: EnergyType[];

    @Field(() => [String])
    @Prop({ type: [String], enum: Object.values(DamageType) })
    baseWeaknesses: DamageType[];

    @Field(() => [Lore])
    @Prop({ type: [Types.ObjectId], ref: Lore.name, default: [] })
    relatedLore: Lore[];

    @Field(() => Int)
    @Prop({ type: Number })
    xp: number;

    @Field(() => [Spell])
    @Prop({ type: [SpellSchema] })
    spells: Spell[];

    @Field(() => Int)
    @Prop({ type: Number })
    lifePoints: number;

    @Field(() => String)
    @Prop({ type: String })
    imagePath: string;

    @Field(() => Damages)
    @Prop({ type: DamagesSchema })
    damages: Damages;
}

export type EnemyDocument = Enemy & Document;
export const EnemySchema = SchemaFactory.createForClass(Enemy);

@InputType()
export class EnemyInput {
    @Field(() => String, { nullable: true })
    id?: string | null;

    @Field(() => String)
    name: string;

    @Field(() => [PoiType])
    locations: PoiType[];

    @Field(() => [EnergyType])
    energyWeaknesses: EnergyType[];

    @Field(() => [DamageType])
    baseWeaknesses: DamageType[];

    @Field(() => [LoreInput], { nullable: true })
    relatedLore?: LoreInput[];

    @Field(() => Int)
    xp: number;

    @Field(() => [ID], { nullable: true })
    spells: string[];

    @Field(() => Int)
    lifePoints: number;

    @Field(() => String)
    imagePath: string;

    @Field(() => DamagesInput)
    damages: DamagesInput;
}

