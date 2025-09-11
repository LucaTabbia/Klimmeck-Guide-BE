import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { QuestInfosSchema, QuestInfos, QuestInfosInput } from './quest-infos.model';
import { QuestRequirementsSchema, QuestRequirements, QuestRequirementsInput } from './quest-requirements.model';
import { QuestPrizesSchema, QuestPrizes, QuestPrizesInput } from './quest-prizes.model';

@ObjectType()
@Schema()
export class Quest {
    @Field(() => ID)
    @Prop({ type: Types.ObjectId })
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

    @Field(() => [String])
    @Prop({ type: [String] })
    registeredAdventurers: string[];
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

    @Field(() => [ID], { nullable: true })
    registeredAdventurers?: string[];
}

