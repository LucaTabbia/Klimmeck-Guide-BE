import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { TitleType } from '../enums/title-type.enum';

// stato interno della capienza per rango (C1): mai esposto su GraphQL, scritto nello stesso update di registeredAdventurers
@Schema({ _id: false })
export class QuestRegistration {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Character',
        required: true,
    })
    character: Types.ObjectId;

    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    title: TitleType;
}

export const QuestRegistrationSchema =
    SchemaFactory.createForClass(QuestRegistration);
