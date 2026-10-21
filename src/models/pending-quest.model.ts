import { ObjectType, Field, ID, InputType, Int } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Quest } from './quest/quest.model';

@ObjectType()
@Schema()
export class PendingQuest {
    @Field(() => ID)
    id: string;

    // null = quest accettata, personaggio in viaggio verso il marker: il countdown parte all'arrivo (D-13, D-15)
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    startDate: Date | null;

    @Field(() => Number)
    @Prop({ type: Number })
    waitingTime: number;

    // punti canale realmente pagati: il rimborso al rifiuto del GM (Phase 9) usa questa cifra, non il catalogo (D-07)
    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    pointsSpent: number;

    @Field(() => Quest)
    @Prop({ type: Types.ObjectId, ref: Quest.name })
    quest: Quest;
}

export type PendingQuestDocument = PendingQuest & Document;
export const PendingQuestSchema = SchemaFactory.createForClass(PendingQuest);

@InputType()
export class PendingQuestInput {
    @Field(() => ID, { nullable: true })
    id?: string;

    @Field(() => Date, { nullable: true })
    startDate?: Date | null;

    @Field(() => Int)
    waitingTime: number;

    @Field(() => Int, { nullable: true })
    pointsSpent?: number;

    @Field(() => ID)
    quest: string;
}
