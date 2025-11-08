import { ObjectType, Field, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AssetItem } from './interfaces/asset-item.model';
import { EquipType } from './enums/equip-type.enum';
import { SpellSchema, Spell } from './spell.model';
import { DamagesSchema, Damages, DamagesInput } from './common/damages.model';
import { Coins } from './common/coins.model';

@ObjectType()
@Schema()
export class EquipmentItem extends AssetItem {
    @Field(() => String)
    @Prop({ type: String, enum: Object.values(EquipType) })
    equipType: EquipType;

    @Field(() => Spell, { nullable: true })
    @Prop({ type: Types.ObjectId, ref: Spell.name, default: null })
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
    rarity?: string | null;

    @Field(() => String, { nullable: true })
    description?: string | null;

    @Field(() => Coins, { nullable: true })
    buyPrice?: Coins | null;

    @Field(() => Coins, { nullable: true })
    sellPrice?: Coins | null;

    @Field(() => EquipType)
    equipType: EquipType;

    @Field(() => ID, { nullable: true })
    addedSpell?: string | null;

    @Field(() => DamagesInput)
    damages: DamagesInput;
}

