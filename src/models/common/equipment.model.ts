import { ObjectType, Field, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EquipmentItemSchema, EquipmentItem, EquipmentItemInput } from '../equipment-item.model';

@ObjectType()
@Schema({ _id: false })
export class Equipment {
    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    head?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    chest?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    arms?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    legs?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    foots?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    leftHand?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    rightHand?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    firstAccessory?: EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: EquipmentItemSchema, default: null })
    secondAccessory?: EquipmentItem | null;
}

export type EquipmentDocument = Equipment & Document;
export const EquipmentSchema = SchemaFactory.createForClass(Equipment);

@InputType()
export class EquipmentInput {
    @Field(() => ID, { nullable: true })
    head?: string | null;

    @Field(() => ID, { nullable: true })
    chest?: string | null;

    @Field(() => ID, { nullable: true })
    arms?: string | null;

    @Field(() => ID, { nullable: true })
    legs?: string | null;

    @Field(() => ID, { nullable: true })
    foots?: string | null;

    @Field(() => ID, { nullable: true })
    leftHand?: string | null;

    @Field(() => ID, { nullable: true })
    rightHand?: string | null;

    @Field(() => ID, { nullable: true })
    firstAccessory?: string | null;

    @Field(() => ID, { nullable: true })
    secondAccessory?: string | null;
}

