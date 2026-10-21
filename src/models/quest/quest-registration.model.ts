import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { TitleType } from '../enums/title-type.enum';

// un posto occupato sulla quest registrata (D-27, D-28a): character e rango al momento dell'accettazione
@ObjectType()
@Schema({ _id: false })
export class QuestRegistration {
    @Field(() => ID)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Character',
        required: true,
    })
    character: Types.ObjectId;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    title: TitleType;
}

export const QuestRegistrationSchema =
    SchemaFactory.createForClass(QuestRegistration);
