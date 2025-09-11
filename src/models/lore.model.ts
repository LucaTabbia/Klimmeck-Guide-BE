import { ObjectType, Field, Int, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LoreType } from './enums/lore-type.enum';
import { LatLng, LatLngInput, LatLngSchema } from './common/lat-lng.model';

@ObjectType()
@Schema()
export class Lore {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(LoreType), default: null })
    type: LoreType;

    @Field(() => String, { nullable: true })
    @Prop({ type: String, default: null })
    image?: string | null;

    @Field(() => [LatLng])
    @Prop({ type: [LatLngSchema], default: [] })
    locations: LatLng[];

    @Field(() => String)
    @Prop({ type: String, default: null })
    name: string;

    @Field(() => String)
    @Prop({ type: String, default: null })
    description: string;

    @Field(() => [Lore])
    @Prop({ type: [Types.ObjectId], ref: Lore.name, default: [] })
    relatedLore: Lore[];

    @Field(() => Boolean)
    @Prop({ type: Boolean, default: false })
    unlocked: boolean;
}

export type LoreDocument = Lore & Document;
export const LoreSchema = SchemaFactory.createForClass(Lore);


@InputType()
export class LoreInput {
    @Field(() => ID, { nullable: true })
    id?: string;

    @Field(() => LoreType, { nullable: true })
    type?: LoreType;

    @Field(() => String, { nullable: true })
    image?: string;

    @Field(() => [LatLngInput], { nullable: true })
    locations?: LatLngInput[];

    @Field(() => String, { nullable: true })
    name?: string;

    @Field(() => String, { nullable: true })
    description?: string;

    @Field(() => [ID], { nullable: true })
    relatedLore?: string[];

    @Field(() => Boolean, { nullable: true })
    unlocked?: boolean;
}

