import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

// riferimento di soccorso della aid automatica (D-08): mai sul filo, il ferito si collega con status.awaitingAid.aidQuest
@Schema({ _id: false })
export class QuestRescue {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Character',
        required: true,
    })
    character: Types.ObjectId;

    // quest del primo combattimento perso: una catena clona sempre l'originale (D-09)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Quest', required: true })
    failedQuest: Types.ObjectId;
}

export const QuestRescueSchema = SchemaFactory.createForClass(QuestRescue);
