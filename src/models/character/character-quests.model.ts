import { ObjectType, Field, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Quest } from '../quest/quest.model';
import { PendingQuest } from '../pending-quest.model';

@ObjectType()
@Schema({ _id: false })
export class CharacterQuests {
    @Field(() => [Quest])
    @Prop({ type: [Types.ObjectId], ref: Quest.name })
    completedQuests: Quest[];

    @Field(() => PendingQuest, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: PendingQuest.name, default: null })
    pendingQuest?: PendingQuest;

    // corsie parallele (D-01): la corsia si sceglie dal tipo della quest, mai dal client; ref castati (Phase 2)
    @Field(() => PendingQuest, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: PendingQuest.name,
        default: null,
    })
    activeStoryQuest?: PendingQuest | null;

    @Field(() => PendingQuest, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: PendingQuest.name,
        default: null,
    })
    activeWorldMissionQuest?: PendingQuest | null;
}

export type CharacterQuestsDocument = CharacterQuests & Document;
export const CharacterQuestsSchema =
    SchemaFactory.createForClass(CharacterQuests);

@InputType()
export class CharacterQuestsInput {
    @Field(() => [ID])
    completedQuests: string[];

    @Field(() => ID, { nullable: true })
    pendingQuest?: string | null;

    @Field(() => ID, { nullable: true })
    activeStoryQuest?: string | null;

    @Field(() => ID, { nullable: true })
    activeWorldMissionQuest?: string | null;
}
