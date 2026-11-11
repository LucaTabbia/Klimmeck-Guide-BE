import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import {
    AssetQuantity,
    AssetQuantityInput,
    AssetQuantitySchema,
} from '../common/asset-quantity.model';
import {
    Equipment,
    EquipmentInput,
    EquipmentSchema,
} from '../common/equipment.model';
import { Pet } from '../pet.model';
import { OwnedPet, OwnedPetSchema } from './owned-pet.model';
import {
    ActiveSpell,
    ActiveSpellInput,
    ActiveSpellSchema,
} from '../common/active-spell.model';

@ObjectType()
@Schema({ _id: false })
export class CharacterAssets {
    @Field(() => [AssetQuantity])
    @Prop({ type: [AssetQuantitySchema] })
    ownedEquipments: AssetQuantity[];

    @Field(() => [AssetQuantity])
    @Prop({ type: [AssetQuantitySchema] })
    ownedItems: AssetQuantity[];

    @Field(() => Equipment)
    @Prop({ type: EquipmentSchema })
    wornEquipment: Equipment;

    @Field(() => [ActiveSpell])
    @Prop({ type: [ActiveSpellSchema] })
    activeSpells: ActiveSpell[];

    // posseduti, distinti dal compagno equipaggiato in `pet` (D-13); default implicito [] voluto: nuovi e legacy leggono una lista
    @Field(() => [OwnedPet])
    @Prop({ type: [OwnedPetSchema] })
    ownedPets: OwnedPet[];

    // il compagno equipaggiato: l'unico letto dal viaggio (D-13)
    @Field(() => Pet, { nullable: true })
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Pet.name, default: null })
    pet?: Pet;
}

export type CharacterAssetsDocument = CharacterAssets & Document;
export const CharacterAssetsSchema =
    SchemaFactory.createForClass(CharacterAssets);

@InputType()
export class CharacterAssetsInput {
    @Field(() => [AssetQuantityInput])
    ownedEquipments: AssetQuantityInput[];

    @Field(() => [AssetQuantityInput])
    ownedItems: AssetQuantityInput[];

    @Field(() => EquipmentInput)
    wornEquipment: EquipmentInput;

    @Field(() => [ActiveSpellInput])
    activeSpells: ActiveSpellInput[];

    @Field(() => ID, { nullable: true })
    pet?: string | null;
}
