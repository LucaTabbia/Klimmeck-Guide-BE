import { ObjectType, Field, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EquipmentItem } from '../equipment-item.model';

@ObjectType()
@Schema({ _id: false })
export class Equipment {
    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    head?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    chest?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    arms?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    legs?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    foots?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    leftHand?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    rightHand?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    firstAccessory?: Types.ObjectId | EquipmentItem | null;

    @Field(() => EquipmentItem, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: EquipmentItem.name, default: null })
    secondAccessory?: Types.ObjectId | EquipmentItem | null;
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

