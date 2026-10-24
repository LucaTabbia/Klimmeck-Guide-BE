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

    // solo sulle aid automatiche (D-08): interno, mai sul filo
    @Prop({ type: QuestRescueSchema, default: null })
    rescue?: QuestRescue | null;
}

export type QuestDocument = Quest & Document;
export const QuestSchema = SchemaFactory.createForClass(Quest);

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
