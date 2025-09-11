// src/cities/models/city.model.ts
import { ObjectType, Field, ID, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CitySizeType } from './enums/city-size-type.enum';
import { CityType } from './enums/city-type.enum';
import { Lore, LoreInput } from './lore.model';
import { LatLngBounds, LatLngBoundsInput, LatLngBoundsSchema } from './common/lat-lng-bounds.model';
import { LatLng, LatLngInput, LatLngSchema } from './common/lat-lng.model';
import { Types } from 'mongoose';

@ObjectType()
@Schema()
export class City {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ type: String })
    image: string;

    @Field(() => CityType)
    @Prop({ type: String, enum: Object.values(CityType) })
    type: CityType;

    @Field(() => CitySizeType)
    @Prop({ type: String, enum: Object.values(CitySizeType) })
    citySize: CitySizeType;

    @Field(() => LatLngBounds)
    @Prop({ type: LatLngBoundsSchema })
    area: LatLngBounds;

    @Field(() => String)
    @Prop({ type: String })
    name: string;

    @Field(() => Int)
    @Prop({ type: Number })
    size: number;

    @Field(() => LatLng)
    @Prop({ type: LatLngSchema })
    markerLocation: LatLng;

    @Field(() => Lore)
    @Prop({ type: Types.ObjectId, ref: Lore.name })
    relatedLore: Lore;
}

export type CityDocument = City & Document;
export const CitySchema = SchemaFactory.createForClass(City);


@InputType()
export class CityInput {
    @Field(() => String, { nullable: true })
    id?: string | null;

    @Field(() => String)
    name: string;

    @Field(() => String)
    image: string;

    @Field(() => CityType)
    type: CityType;

    @Field(() => CitySizeType)
    citySize: CitySizeType;

    @Field(() => LatLngBoundsInput)
    area: LatLngBoundsInput;

    @Field(() => Int)
    size: number;

    @Field(() => LatLngInput)
    markerLocation: LatLngInput;

    @Field(() => ID, { nullable: true })
    relatedLore?: string | null;
}

