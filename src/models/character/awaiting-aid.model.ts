import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

// personaggio sconfitto in attesa di soccorso (D-07): blocca viaggio e accettazione, non il teleport; scritto solo dal server
@ObjectType()
@Schema({ _id: false })
export class AwaitingAid {
    // quest del primo combattimento perso: in una catena di soccorsi resta l'originale (D-09)
    @Field(() => ID)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Quest', required: true })
    quest: Types.ObjectId;

    // la quest aid clonata che lo riguarda (D-08)
    @Field(() => ID)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Quest', required: true })
    aidQuest: Types.ObjectId;

    // creazione della aid: il timeout di 7 giorni parte da qui (D-10)
    @Field(() => Date)
    @Prop({ type: Date, required: true })
    since: Date;
}

export const AwaitingAidSchema = SchemaFactory.createForClass(AwaitingAid);
