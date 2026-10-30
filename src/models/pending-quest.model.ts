import { ObjectType, Field, ID, InputType, Int } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Quest } from './quest/quest.model';

@ObjectType()
@Schema()
export class PendingQuest {
    @Field(() => ID)
    id: string;

    // null = in viaggio verso il marker (D-15) o, per le quest registrate, in attesa del gruppo: lo scrive solo QuestStartService (utente 2026-10-25: "per poterle cominciare il party dev'essere al completo")
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    startDate: Date | null;

    // arrivo sul marker (D-13 emendata 2026-10-25): per la corsia standard startDate resta nullo finché la quest non comincia (QuestStartService)
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    arrivedAt: Date | null;

    @Field(() => Number)
    @Prop({ type: Number })
    waitingTime: number;

    // punti canale realmente pagati: il rimborso al rifiuto del GM (Phase 9) usa questa cifra, non il catalogo (D-07)
    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    pointsSpent: number;

    @Field(() => Quest)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Quest.name })
    quest: Quest;
}

export type PendingQuestDocument = PendingQuest & Document;
export const PendingQuestSchema = SchemaFactory.createForClass(PendingQuest);

export const PENDING_QUEST_LANE_DATES_INDEX = 'pending_quest_lane_dates';

// serve gli arrivati non ancora avviati e le letture di corsia (D-17b)
PendingQuestSchema.index(
    { quest: 1, startDate: 1, arrivedAt: 1 },
    { name: PENDING_QUEST_LANE_DATES_INDEX },
);

@InputType()
export class PendingQuestInput {
    @Field(() => ID, { nullable: true })
    id?: string;

    @Field(() => Date, { nullable: true })
    startDate?: Date | null;

    @Field(() => Int)
    waitingTime: number;

    @Field(() => Int, { nullable: true })
    pointsSpent?: number;

    @Field(() => ID)
    quest: string;
}
