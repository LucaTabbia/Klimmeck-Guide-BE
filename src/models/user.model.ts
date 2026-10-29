import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { RoleType } from './enums/role-type.enum';
import { Character } from './character/character.model';

@ObjectType()
@Schema()
export class User {
    @Field(() => ID)
    id: string;

    @Field(() => String)
    @Prop({ required: true, unique: true })
    twitchId: string;

    @Field(() => Int)
    @Prop({ type: Number })
    twitchPoints: number;

    @Field(() => RoleType)
    @Prop({ type: String, enum: Object.values(RoleType) })
    role: RoleType;

    @Field(() => Character, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: Character.name, default: null })
    currentCharacter: Character | null;
}

export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User).set(
    'versionKey',
    false,
);

export const USER_CURRENT_CHARACTER_INDEX = 'user_current_character';

// serve la ricerca dei proprietari dei personaggi e la notifica del proprietario (D-17b)
UserSchema.index(
    { currentCharacter: 1 },
    { name: USER_CURRENT_CHARACTER_INDEX },
);
