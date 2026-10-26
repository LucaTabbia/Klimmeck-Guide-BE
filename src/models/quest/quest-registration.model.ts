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

    // apre la finestra di 24 ore del party (utente 2026-10-25: "Se entro 24 ore i posti non diventano pieni, allora la missione viene annullata in automatico per tutti."); senza default: lo scrive solo la registrazione nuova
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date })
    registeredAt?: Date | null;
}

export const QuestRegistrationSchema =
    SchemaFactory.createForClass(QuestRegistration);
