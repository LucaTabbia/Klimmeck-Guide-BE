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
