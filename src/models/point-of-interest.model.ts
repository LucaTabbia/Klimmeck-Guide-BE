import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Quest } from './quest/quest.model';
import { City } from './city.model';
import { PoiType } from './enums/poi-type.enum';

@ObjectType()
@Schema({ collection: "pointsofinterest" })
export class PointOfInterest {
    @Field(() => ID)
    id: string;

    @Field(() => [PoiType])
    @Prop({ type: String, enum: Object.values(PoiType) })
    type: PoiType[];

    @Field(() => [Float, Float])
    @Prop({ type: [Number, Number], required: true })
    location: [number, number];

    @Field(() => City, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: "City" })
    city: Types.ObjectId | City;

    @Field(() => ID, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: "Quest", required: false })
    quest?: Types.ObjectId | Quest | null;
}

export type PointOfInterestDocument = PointOfInterest & Document;
export const PointOfInterestSchema = SchemaFactory.createForClass(PointOfInterest);
