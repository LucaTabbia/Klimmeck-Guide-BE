import { ObjectType, Field, Int, InputType, ID, Float } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QuestType } from '../enums/quest-type.enum';
import { Enemy } from '../enemy.model';
import { Lore } from '../lore.model';
import { PointOfInterest } from '../point-of-interest.model';

@ObjectType()
@Schema({ _id: false })
export class QuestInfos {
    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    timeToComplete?: number;

    @Field(() => String)
    @Prop({ type: String })
    title: string;

    @Field(() => Enemy, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: Enemy.name, default: null })
    enemy?: Enemy | null;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(QuestType) })
    type: QuestType;

    @Field(() => PointOfInterest)
    @Prop({ type: Types.ObjectId, ref: PointOfInterest.name, required: true })
    markerLocation: Types.ObjectId | PointOfInterest;

    @Field(() => [Lore])
    @Prop({ type: [Types.ObjectId], ref: Lore.name })
    relatedLore: Lore[];
}

export type QuestInfosDocument = QuestInfos & Document;
export const QuestInfosSchema = SchemaFactory.createForClass(QuestInfos);

@InputType()
export class QuestInfosInput {
    @Field(() => Int, { nullable: true })
    timeToComplete?: number;

    @Field()
    title: string;

    @Field(() => ID, { nullable: true })
    enemy?: string | null;

    @Field(() => QuestType)
    type: QuestType;

    @Field(() => ID)
    markerLocation: string;

    @Field(() => [ID])
    relatedLore: string[];
}

