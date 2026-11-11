import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { Spell } from '../spell.model';

// usi e recuperi appartengono alla magia conosciuta, non allo slot (D-01, D-03): unica fonte di verità
@ObjectType()
@Schema({ _id: false })
export class SpellState {
    @Field(() => Spell)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        required: true,
    })
    spell: Types.ObjectId | Spell;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    usages: number;

    // crescente: il primo istante è il prossimo uso che torna (D-02)
    @Field(() => [Date])
    @Prop({ type: [Date], default: [] })
    recoveries: Date[];

    // una sola lista in ordine di apprendimento: equipaggiata è un flag della voce, non una seconda lista (D-07, D-16)
    @Field(() => Boolean)
    @Prop({ type: Boolean, default: false })
    active: boolean;
}

export const SpellStateSchema = SchemaFactory.createForClass(SpellState);
