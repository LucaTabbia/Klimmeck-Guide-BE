import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ClassType } from '../enums/class-type.enum';
import { PronounType } from '../enums/pronoun-type.enum';
import { RaceType } from '../enums/race-type.enum';
import { SexType } from '../enums/sex-type.enum';

@ObjectType()
@Schema({ _id: false })
export class CharacterInfos {
    @Field(() => String, { nullable: true })
    @Prop({ type: String, default: null })
    imagePath?: string | null;

    @Field(() => String,)
    @Prop({ type: String, enum: Object.values(SexType) })
    sex: SexType;

    @Field(() => String,)
    @Prop({ type: String })
    name: string;

    @Field(() => String,)
    @Prop({ type: String, enum: Object.values(RaceType) })
    race: RaceType;

    @Field(() => String,)
    @Prop({ type: String, enum: Object.values(PronounType) })
    pronoun: PronounType;

    @Field(() => String,)
    @Prop({ type: String, enum: Object.values(ClassType) })
    classType: ClassType;

    @Field(() => Int,)
    @Prop({ type: Number })
    age: number;

    @Field(() => String,)
    @Prop({ type: String })
    background: string;
}

export type CharacterInfosDocument = CharacterInfos & Document;
export const CharacterInfosSchema = SchemaFactory.createForClass(CharacterInfos);


@InputType()
export class CharacterInfosInput {
    @Field(() => String, { nullable: true })
    imagePath?: string | null;

    @Field(() => String)
    sex: SexType;

    @Field(() => String)
    name: string;

    @Field(() => String)
    race: RaceType;

    @Field(() => String)
    pronoun: PronounType;

    @Field(() => String)
    classType: ClassType;

    @Field(() => Int)
    age: number;

    @Field(() => String)
    background: string;
}

