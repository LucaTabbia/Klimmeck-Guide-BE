import { Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class AwaitingAid {}

export const AwaitingAidSchema = SchemaFactory.createForClass(AwaitingAid);
