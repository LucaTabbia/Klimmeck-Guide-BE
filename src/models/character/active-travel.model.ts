import { Schema, SchemaFactory } from '@nestjs/mongoose';

export enum TravelKind {
    free = 'free',
    quest = 'quest',
}

@Schema({ _id: false })
export class TravelPath {}

export const TravelPathSchema = SchemaFactory.createForClass(TravelPath);

@Schema({ _id: false })
export class ActiveTravel {}

export const ActiveTravelSchema = SchemaFactory.createForClass(ActiveTravel);
