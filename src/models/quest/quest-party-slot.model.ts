import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TitleType } from '../enums/title-type.enum';

// slot per rango (D-28b): title null = qualsiasi rango; gli slot esatti si riempiono prima dei jolly (D-32)
@ObjectType()
@Schema({ _id: false })
export class QuestPartySlot {
    @Field(() => String, { nullable: true })
    @Prop({ type: String, enum: Object.values(TitleType), default: null })
    title: TitleType | null;

    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 1 })
    count: number;
}

export const QuestPartySlotSchema =
    SchemaFactory.createForClass(QuestPartySlot);

@InputType()
export class QuestPartySlotInput {
    @Field(() => TitleType, { nullable: true })
    title?: TitleType | null;

    @Field(() => Int)
    count: number;
}
