import { ObjectType, Field, Float, InputType } from "@nestjs/graphql";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@ObjectType()
@Schema({ _id: false })
export class LatLng {
    @Field(() => Float)
    @Prop({ type: Number, required: true })
    latitude: number;

    @Field(() => Float)
    @Prop({ type: Number, required: true })
    longitude: number;
}

export type LatLngDocument = LatLng & Document;
export const LatLngSchema = SchemaFactory.createForClass(LatLng);

@InputType()
export class LatLngInput {
    @Field(() => Float)
    latitude: number;

    @Field(() => Float)
    longitude: number;
}
