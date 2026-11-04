import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { QuestType } from '../enums/quest-type.enum';
import { Lore } from '../lore.model';
import { PointOfInterest } from '../point-of-interest.model';
import { QuestEnemy, QuestEnemySchema } from './quest-enemy.model';

@ObjectType()
@Schema({ _id: false })
export class QuestInfos {
    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    timeToComplete?: number;

    @Field(() => String)
    @Prop({ type: String })
    title: string;

    @Field(() => [QuestEnemy])
    @Prop({ type: [QuestEnemySchema], default: [] })
    enemies: QuestEnemy[];

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(QuestType) })
    type: QuestType;

    @Field(() => PointOfInterest)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: PointOfInterest.name,
        required: true,
    })
    markerLocation: Types.ObjectId | PointOfInterest;

    @Field(() => [Lore])
    @Prop({ type: [MongooseSchema.Types.ObjectId], ref: Lore.name })
    relatedLore: Lore[];

    @Field(() => String, { nullable: true })
    @Prop({ type: String, default: null })
    description?: string | null;
}

export type QuestInfosDocument = QuestInfos & Document;
export const QuestInfosSchema = SchemaFactory.createForClass(QuestInfos);

@InputType()
export class QuestInfosInput {
    @Field(() => Int, { nullable: true })
    timeToComplete?: number;

    @Field()
    title: string;

    @Field(() => QuestType)
    type: QuestType;

    @Field(() => ID)
    markerLocation: string;

    @Field(() => [ID])
    relatedLore: string[];

    @Field(() => String, { nullable: true })
    description?: string | null;
}
