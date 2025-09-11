import { ObjectType, Field, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Spell } from '../spell.model';

@ObjectType()
@Schema(({ _id: false }))
export class ActiveSpell {
    @Field(() => Spell)
    @Prop({ type: Types.ObjectId, ref: Spell.name })
    spell: Spell;

    @Field(() => Int)
    @Prop({ type: Number })
    usages: number;
}

export type ActiveSpellDocument = ActiveSpell & Document;
export const ActiveSpellSchema = SchemaFactory.createForClass(ActiveSpell);

@InputType()
export class ActiveSpellInput {
    @Field(() => ID, { nullable: true })
    spell?: string | null;

    @Field(() => Int)
    usages: number;
}
