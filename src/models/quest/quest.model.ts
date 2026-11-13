import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
    QuestInfosSchema,
    QuestInfos,
    QuestInfosInput,
} from './quest-infos.model';
import {
    QuestRequirementsSchema,
    QuestRequirements,
    QuestRequirementsInput,
} from './quest-requirements.model';
import {
    QuestPrizesSchema,
    QuestPrizes,
    QuestPrizesInput,
} from './quest-prizes.model';
import {
    QuestRegistration,
    QuestRegistrationSchema,
} from './quest-registration.model';
import { QuestRescue, QuestRescueSchema } from './quest-rescue.model';

@ObjectType()
@Schema()
export class Quest {
    @Field(() => ID)
    id: string;

    @Field(() => QuestInfos)
    @Prop({ type: QuestInfosSchema })
    infos: QuestInfos;

    @Field(() => QuestRequirements)
    @Prop({ type: QuestRequirementsSchema })
    requirements: QuestRequirements;

    @Field(() => QuestPrizes)
    @Prop({ type: QuestPrizesSchema })
    prizes: QuestPrizes;

    // una sola fonte dei posti occupati (D-28a): scritta solo dall'accettazione, liberata dalla cancellazione (D-30)
    @Field(() => [QuestRegistration])
    @Prop({ type: [QuestRegistrationSchema], default: [] })
    registeredAdventurers: QuestRegistration[];

    // marcatore globale (D-06): una quest registrata vinta (o una aid risolta) sparisce dalla board per tutti; interno, mai sul filo
    @Prop({ type: Date, default: null })
    concludedAt?: Date | null;

    // avvio del party a posti pieni e tutti sul marker (utente 2026-10-25: "per poterle cominciare il party dev'essere al completo"): claim di QuestStartService; interno, mai sul filo
    @Prop({ type: Date, default: null })
    startedAt?: Date | null;

    // solo sulle aid automatiche (D-08): interno, mai sul filo
    @Prop({ type: QuestRescueSchema, default: null })
    rescue?: QuestRescue | null;

    // quest creata dal generatore (D-17): conta nel tetto per città e nel rango meno coperto; interno, mai sul filo
    @Prop({ type: Boolean, default: false })
    generated: boolean;
}

export type QuestDocument = Quest & Document;
export const QuestSchema = SchemaFactory.createForClass(Quest);

export const QUEST_FORMING_PARTIES_INDEX = 'quest_forming_parties';
export const QUEST_REGISTERED_CHARACTER_INDEX = 'quest_registered_character';

// serve lo sweep dei party in formazione (D-17b); il prefisso infos.type + concludedAt regge anche la lettura delle aid aperte
// (blocco di acceptQuest e Quest.awaitingRescue, quick 261113-aql) e il report al boot dell'ordine delle dungeon: non toglierlo senza un sostituto
QuestSchema.index(
    { 'infos.type': 1, concludedAt: 1, startedAt: 1 },
    { name: QUEST_FORMING_PARTIES_INDEX },
);
// serve i posti liberati dall'archivio e le letture del party (D-17b)
QuestSchema.index(
    { 'registeredAdventurers.character': 1 },
    { name: QUEST_REGISTERED_CHARACTER_INDEX },
);

export const QUEST_GENERATED_OPEN_MARKER_INDEX = 'quest_generated_open_marker';
// una sola generata aperta per POI anche sotto concorrenza (D-28): il secondo insert riceve E11000
QuestSchema.index(
    { 'infos.markerLocation': 1 },
    {
        unique: true,
        name: QUEST_GENERATED_OPEN_MARKER_INDEX,
        partialFilterExpression: { generated: true, concludedAt: null },
    },
);

@InputType()
export class QuestInput {
    @Field(() => ID, { nullable: true })
    id?: string | null;

    @Field(() => QuestInfosInput)
    infos: QuestInfosInput;

    @Field(() => QuestRequirementsInput)
    requirements: QuestRequirementsInput;

    @Field(() => QuestPrizesInput)
    prizes: QuestPrizesInput;
}
