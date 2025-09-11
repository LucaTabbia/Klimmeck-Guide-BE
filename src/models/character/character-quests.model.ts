import { ObjectType, Field, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
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
}

export type CharacterQuestsDocument = CharacterQuests & Document;
export const CharacterQuestsSchema = SchemaFactory.createForClass(CharacterQuests);

@InputType()
export class CharacterQuestsInput {
    @Field(() => [ID])
    completedQuests: string[];

    @Field(() => ID, { nullable: true })
    pendingQuest?: string | null;
}

