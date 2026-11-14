import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { COMPANION_LEVELS } from 'src/characters/pets/companion-level';
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

    // riposo, sconfitta e livello salvato (D-23, D-24, D-39): ancora currentLifePoints @ lifeAsOf; senza level né lifeAsOf la voce è legacy e si legge piena
    @Field(() => String, { nullable: true })
    @Prop({ type: String })
    name?: string | null;

    @Field(() => Date, { nullable: true })
    @Prop({ type: Date })
    lifeAsOf?: Date | null;

    @Prop({ type: Date })
    defeatedUntil?: Date | null;

    @Field(() => Date, { nullable: true })
    @Prop({ type: Date })
    potionRecoveryUntil?: Date | null;

    @Prop({ type: Number, min: 1, max: COMPANION_LEVELS })
    level?: number;
}

export const OwnedPetSchema = SchemaFactory.createForClass(OwnedPet);
