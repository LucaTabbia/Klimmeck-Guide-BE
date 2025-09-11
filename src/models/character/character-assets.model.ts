import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AssetQuantity, AssetQuantityInput, AssetQuantitySchema } from '../common/asset-quantity.model';
import { Equipment, EquipmentInput, EquipmentSchema } from '../common/equipment.model';
import { Pet } from '../pet.model';
import { ActiveSpell, ActiveSpellInput, ActiveSpellSchema } from '../common/active-spell.model';

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
    wearedEquipment: Equipment;

    @Field(() => [ActiveSpell])
    @Prop({ type: [ActiveSpellSchema] })
    activeSpells: ActiveSpell[];

    @Field(() => Pet, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: Pet.name, default: null })
    pet?: Pet;
}

export type CharacterAssetsDocument = CharacterAssets & Document;
export const CharacterAssetsSchema = SchemaFactory.createForClass(CharacterAssets);


@InputType()
export class CharacterAssetsInput {
    @Field(() => [AssetQuantityInput])
    ownedEquipments: AssetQuantityInput[];

    @Field(() => [AssetQuantityInput])
    ownedItems: AssetQuantityInput[];

    @Field(() => EquipmentInput)
    wearedEquipment: EquipmentInput;

    @Field(() => [ActiveSpellInput])
    activeSpells: ActiveSpellInput[];

    @Field(() => ID, { nullable: true })
    pet?: string | null;
}

