import { ObjectType, Field, ID, InputType, Int } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Quest } from './quest/quest.model';

@ObjectType()
@Schema()
export class PendingQuest {
    @Field(() => ID)
    id: string;

    @Field(() => Date)
    @Prop({ type: Date })
    startDate: Date;

    @Field(() => Number)
    @Prop({ type: Number })
    waitingTime: number;

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

    @Field(() => Date)
    startDate: Date;

    @Field(() => Int)
    waitingTime: number;

    @Field(() => ID)
    quest: string;
}

