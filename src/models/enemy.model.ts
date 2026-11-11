import { ObjectType, Field, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Spell } from './spell.model';
import { Damages, DamagesInput, DamagesSchema } from './common/damages.model';
import {
    Weaknesses,
    WeaknessesInput,
    WeaknessesSchema,
} from './common/weaknesses.model';
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
    @Prop({ type: [String], enum: Object.values(PoiType), default: [] })
    locations: PoiType[];

    // default a funzione: un nemico salvato senza il campo si idrata con le due liste vuote (Phase 19 D-01)
    @Field(() => Weaknesses)
    @Prop({ type: WeaknessesSchema, default: () => ({}) })
    weaknesses: Weaknesses;

    @Field(() => [Lore])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Lore.name,
        default: [],
    })
    relatedLore: Lore[];

    @Field(() => Int)
    @Prop({ type: Number })
    xp: number;

    @Field(() => [Spell])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Spell.name,
        default: [],
    })
    spells: (Types.ObjectId | Spell)[];

    @Field(() => Int)
    @Prop({ type: Number })
    lifePoints: number;

    @Field(() => String)
    @Prop({ type: String })
    imagePath: string;

    // i 22 leggendari sono delle worldMission (D-04): il generatore legge solo legendary false, scritto dal migratore una tantum
    @Field(() => Boolean)
    @Prop({ type: Boolean, default: false })
    legendary: boolean;

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

    @Field(() => WeaknessesInput)
    weaknesses: WeaknessesInput;

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
