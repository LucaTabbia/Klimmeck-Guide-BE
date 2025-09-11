import { ObjectType, Field, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { LatLng, LatLngInput, LatLngSchema } from './lat-lng.model';

@ObjectType()
@Schema({ _id: false })
export class LatLngBounds {
    @Field(() => LatLng)
    @Prop({ type: LatLngSchema, required: true })
    southWest: LatLng;

    @Field(() => LatLng)
    @Prop({ type: LatLngSchema, required: true })
    northEast: LatLng;
}

export type LatLngBoundsDocument = LatLngBounds & Document;
export const LatLngBoundsSchema = SchemaFactory.createForClass(LatLngBounds);

@InputType()
export class LatLngBoundsInput {
    @Field(() => LatLngInput)
    southWest: LatLngInput;

    @Field(() => LatLngInput)
    northEast: LatLngInput;
}

