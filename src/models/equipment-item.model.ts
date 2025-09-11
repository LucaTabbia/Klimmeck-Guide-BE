import { ObjectType, Field, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AssetItem } from './interfaces/asset-item.model';
import { EquipType } from './enums/equip-type.enum';
import { SpellSchema, Spell, SpellInput } from './spell.model';
import { DamagesSchema, Damages, DamagesInput } from './common/damages.model';

@ObjectType({ implements: AssetItem })
@Schema()
export class EquipmentItem extends AssetItem {
    @Field(() => String)
    @Prop({ type: String, enum: Object.values(EquipType) })
    equipType: EquipType;

    @Field(() => Spell, { nullable: true })
    @Prop({ type: SpellSchema, default: null })
    addedSpell?: Spell | null;

    @Field(() => Damages)
    @Prop({ type: DamagesSchema })
    damages: Damages;
}

export type EquipmentItemDocument = EquipmentItem & Document;
export const EquipmentItemSchema = SchemaFactory.createForClass(EquipmentItem);


@InputType()
export class EquipmentItemInput {
    @Field(() => String, { nullable: true })
    id?: string | null;

    @Field(() => String)
    name: string;

    @Field(() => String, { nullable: true })
    description?: string | null;

    @Field(() => String, { nullable: true })
    image?: string | null;

    @Field(() => String, { nullable: true })
    rarity?: string | null;

    @Field(() => Number, { nullable: true })
    buyPrice?: number | null;

    @Field(() => Number, { nullable: true })
    sellPrice?: number | null;

    @Field(() => EquipType)
    equipType: EquipType;

    @Field(() => ID, { nullable: true })
    addedSpell?: string | null;

    @Field(() => DamagesInput)
    damages: DamagesInput;
}

