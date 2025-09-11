import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QuestType } from '../enums/quest-type.enum';
import { LatLng, LatLngInput, LatLngSchema } from '../common/lat-lng.model';
import { Enemy } from '../enemy.model';
import { LatLngBounds, LatLngBoundsInput, LatLngBoundsSchema } from '../common/lat-lng-bounds.model';
import { Lore, LoreInput } from '../lore.model';

@ObjectType()
@Schema({ _id: false })
export class QuestInfos {
    @Field(() => Int)
    @Prop({ type: Number })
    timeToComplete: number;

    @Field(() => String)
    @Prop({ type: String })
    title: string;

    @Field(() => Enemy, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: Enemy.name, default: null })
    enemy?: Enemy | null;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(QuestType) })
    type: QuestType;

    @Field(() => LatLngBounds)
    @Prop({ type: LatLngBoundsSchema })
    area: LatLngBounds;

    @Field(() => LatLng)
    @Prop({ type: LatLngSchema })
    markerLocation: LatLng;

    @Field(() => [Lore])
    @Prop({ type: [Types.ObjectId], ref: Lore.name })
    relatedLore: Lore[];
}

export type QuestInfosDocument = QuestInfos & Document;
export const QuestInfosSchema = SchemaFactory.createForClass(QuestInfos);

@InputType()
export class QuestInfosInput {
    @Field(() => Int)
    timeToComplete: number;

    @Field()
    title: string;

    @Field(() => ID, { nullable: true })
    enemy?: string | null;

    @Field(() => QuestType)
    type: QuestType;

    @Field(() => LatLngBoundsInput)
    area: LatLngBoundsInput;

    @Field(() => LatLngInput)
    markerLocation: LatLngInput;

    @Field(() => [ID])
    relatedLore: string[];
}

