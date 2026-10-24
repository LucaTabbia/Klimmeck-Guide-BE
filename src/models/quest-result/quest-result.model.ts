import { Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class QuestRewards {}

export const QuestRewardsSchema = SchemaFactory.createForClass(QuestRewards);

@Schema()
export class QuestResult {}

export const QuestResultSchema = SchemaFactory.createForClass(QuestResult);
