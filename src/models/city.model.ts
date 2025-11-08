import { ObjectType, Field, ID, Float, InputType } from "@nestjs/graphql";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { CityType } from "./enums/city-type.enum";
import { Lore } from "./lore.model";
import { PointOfInterest } from "./point-of-interest.model";


@ObjectType()
@Schema()
export class City {
    @Field(() => ID)
    id: string;

    @Field(() => CityType)
    @Prop({ type: String, enum: Object.values(CityType) })
    type: CityType;

    @Field(() => [[Float]])
    @Prop({ type: [[Number]], default: [] })
    area: number[][];

    @Field(() => String)
    @Prop({ type: String })
    name: string;

    @Field(() => PointOfInterest)
    @Prop({ type: Types.ObjectId, ref: 'PointOfInterest', required: true })
    markerLocation: Types.ObjectId | PointOfInterest;

    @Field(() => Lore, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: Lore.name, required: false })
    relatedLore?: Types.ObjectId | Lore | null;

    @Field(() => [PointOfInterest], { nullable: true })
    @Prop({ type: [{ type: Types.ObjectId, ref: 'PointOfInterest' }], default: [] })
    pointsOfInterest?: (Types.ObjectId | PointOfInterest)[];
}


export type CityDocument = City & Document;
export const CitySchema = SchemaFactory.createForClass(City);


@InputType()
export class CityInput {
    @Field(() => String, { nullable: true })
    id?: string | null;

    @Field(() => String)
    name: string;

    @Field(() => CityType)
    type: CityType;

    @Field(() => [[Float]])
    area: number[][];

    @Field(() => ID)
    markerLocation: string;

    @Field(() => ID, { nullable: true })
    relatedLore?: string | null;

    @Field(() => [ID])
    pointsOfInterest: string[];
}
