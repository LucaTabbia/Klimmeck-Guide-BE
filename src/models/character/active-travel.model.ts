import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

// tipo del viaggio persistito per la push di fine viaggio (D-14): interno, mai su GraphQL
export enum TravelKind {
    free = 'free',
    quest = 'quest',
}

// polilinea unica del cammino Dijkstra, orientata dalla partenza alla meta, POI di partenza e arrivo come estremi (D-10)
@ObjectType()
@Schema({ _id: false })
export class TravelPath {
    @Field(() => [[Float]])
    @Prop({ type: [[Number]], required: true })
    coordinates: [number, number][];

    // km di gioco (stessa base di getPath)
    @Field(() => Float)
    @Prop({ type: Number, required: true })
    distance: number;
}

export const TravelPathSchema = SchemaFactory.createForClass(TravelPath);

// endTime persistito è la fonte di verità del completamento (STATE [Phase 8], D-09, D-12); duration = endTime − startTime in ms
@ObjectType()
@Schema({ _id: false })
export class ActiveTravel {
    @Field(() => TravelPath)
    @Prop({ type: TravelPathSchema, required: true })
    road: TravelPath;

    @Field(() => Date)
    @Prop({ type: Date, required: true })
    startTime: Date;

    @Field(() => Date)
    @Prop({ type: Date, required: true })
    endTime: Date;

    @Field(() => Float)
    @Prop({ type: Number, required: true })
    duration: number;

    // esadecimale del POI di arrivo (C9): nessun populate, il FE lo risolve dai POI che conosce
    @Field(() => ID)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'PointOfInterest',
        required: true,
    })
    to: Types.ObjectId;

    @Prop({ type: String, enum: Object.values(TravelKind), required: true })
    kind: TravelKind;
}

export const ActiveTravelSchema = SchemaFactory.createForClass(ActiveTravel);
