import { Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class QuestRescue {}

export const QuestRescueSchema = SchemaFactory.createForClass(QuestRescue);
