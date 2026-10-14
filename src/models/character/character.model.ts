import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
    CharacterInfosSchema,
    CharacterInfos,
    CharacterInfosInput,
} from './character-infos.model';
import {
    CharacterStatusSchema,
    CharacterStatus,
    CharacterStatusInput,
} from './character-status.model';
import {
    CharacterQuestsSchema,
    CharacterQuests,
    CharacterQuestsInput,
} from './character-quests.model';
import {
    CharacterAssetsSchema,
    CharacterAssets,
    CharacterAssetsInput,
} from './character-assets.model';

@ObjectType()
@Schema()
export class Character {
    @Field(() => ID)
    id: string;

    @Field(() => CharacterInfos)
    @Prop({ type: CharacterInfosSchema })
    infos: CharacterInfos;

    @Field(() => CharacterStatus)
    @Prop({ type: CharacterStatusSchema })
    status: CharacterStatus;

    @Field(() => CharacterQuests)
    @Prop({ type: CharacterQuestsSchema })
    quests: CharacterQuests;

    @Field(() => CharacterAssets)
    @Prop({ type: CharacterAssetsSchema })
    assets: CharacterAssets;
}

export type CharacterDocument = Character & Document;
export const CharacterSchema = SchemaFactory.createForClass(Character);

export const CHARACTER_NAME_INDEX = 'character_name_ci_unique';
export const CHARACTER_NAME_COLLATION = { locale: 'en', strength: 2 } as const;

// unicità case-insensitive garantita dal DB (D-18): strength 2 ignora maiuscole, non gli accenti
CharacterSchema.index(
    { 'infos.name': 1 },
    {
        unique: true,
        collation: CHARACTER_NAME_COLLATION,
        name: CHARACTER_NAME_INDEX,
    },
);

@InputType()
export class CharacterInput {
    @Field(() => ID, { nullable: true })
    id?: string | null;

    @Field(() => CharacterInfosInput)
    infos: CharacterInfosInput;

    @Field(() => CharacterStatusInput)
    status: CharacterStatusInput;

    @Field(() => CharacterQuestsInput)
    quests: CharacterQuestsInput;

    @Field(() => CharacterAssetsInput)
    assets: CharacterAssetsInput;
}
