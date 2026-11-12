import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { Pet } from '../pet.model';

// lo stato di un pet vive sulla voce del personaggio; il catalogo tiene le basi (Phase 19 D-03)
@ObjectType()
@Schema({ _id: false })
export class OwnedPet {
    @Field(() => Pet)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Pet.name,
        required: true,
    })
    pet: Types.ObjectId | Pet;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    xp: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    currentLifePoints: number;
}

export const OwnedPetSchema = SchemaFactory.createForClass(OwnedPet);
