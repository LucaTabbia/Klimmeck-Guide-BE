import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TitleType } from '../enums/title-type.enum';

// slot esatti per titolo (D-04): un avventuriero occupa solo lo slot del proprio status.title
@ObjectType()
@Schema({ _id: false })
export class QuestPartySlot {
    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    title: TitleType;

    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 1 })
    count: number;
}

export const QuestPartySlotSchema =
    SchemaFactory.createForClass(QuestPartySlot);

@InputType()
export class QuestPartySlotInput {
    @Field(() => TitleType)
    title: TitleType;

    @Field(() => Int)
    count: number;
}
