import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// il compagno sul foglio dell'esito (D-10, D-27): vita prima e dopo, massimo del livello raggiunto, sconfitta e ritorno in forze
@ObjectType()
@Schema({ _id: false })
export class CompanionOutcome {
    @Field(() => Boolean)
    @Prop({ type: Boolean, required: true })
    defeated: boolean;

    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    fullLifeAt: Date | null;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    lifeBefore: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    lifePoints: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    maxLifePoints: number;

    // nome mostrato: quello dato dal giocatore o la specie
    @Field(() => String)
    @Prop({ type: String, required: true })
    name: string;
}

export const CompanionOutcomeSchema =
    SchemaFactory.createForClass(CompanionOutcome);
