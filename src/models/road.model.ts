import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectType, Field, Float, ID } from '@nestjs/graphql';
import { Document } from 'mongoose';

@ObjectType()
@Schema({ collection: 'roads' })
export class Road {
    @Field(() => ID)
    id: string;

    @Field(() => [[Number]])
    @Prop({ type: [[Number]], required: true })
    coordinates: [number, number][];

    @Field(() => Float)
    @Prop({ required: true })
    length: number;

    @Field(() => Float)
    @Prop({ required: true })
    speedFactor: number;
}

export type RoadDocument = Road & Document;
export const RoadSchema = SchemaFactory.createForClass(Road);
