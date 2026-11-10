import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { AssetItem } from './interfaces/asset-item.model';
import { EffectType } from './enums/effect-type.enum';
import { InjuryType } from './enums/injury-type.enum';
import { Lore } from './lore.model';

// ricarica di una pozione (Phase 18 D-15): time in millisecondi come Spell.recoveryTime; turns è solo dato per il motore di combattimento (D-16)
@ObjectType()
@Schema({ _id: false })
export class LootRecovery {
    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger })
    time: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger })
    turns: number;
}

export const LootRecoverySchema = SchemaFactory.createForClass(LootRecovery);

@ObjectType()
@Schema()
export class LootItem extends AssetItem {
    @Field(() => Int)
    @Prop({ type: Number })
    power: number;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(EffectType) })
    effect: EffectType;

    // ferite che un oggetto heal può curare (regola utente 2026-11-09); la meccanica arriva in una fase dedicata
    // campo già presente a DB sui vecchi oggetti heal: riusato (utente 2026-11-09)
    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    canHeal: InjuryType[];

    // assente o null = la pozione non si beve dal Diario (D-15)
    @Field(() => LootRecovery, { nullable: true })
    @Prop({ type: LootRecoverySchema, default: null })
    recovery?: LootRecovery | null;

    // lore sbloccate alla prima bevuta (D-19); sul filo filtrate per viewer dal resolver sul tipo
    @Field(() => [Lore])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Lore.name,
        default: [],
    })
    relatedLore: Lore[];
}

export type LootItemDocument = LootItem & Document;
export const LootItemSchema = SchemaFactory.createForClass(LootItem);

@InputType()
export class LootRecoveryInput {
    @Field(() => Int)
    time: number;

    @Field(() => Int)
    turns: number;
}

@InputType()
export class LootItemInput {
    @Field(() => String, { nullable: true })
    id?: string | null;

    @Field(() => String)
    name: string;

    @Field(() => String, { nullable: true })
    rarity?: string | null;

    @Field(() => Number, { nullable: true })
    buyPrice?: number | null;

    @Field(() => Number, { nullable: true })
    sellPrice?: number | null;

    @Field(() => Int)
    power: number;

    @Field(() => EffectType)
    effect: EffectType;

    @Field(() => [InjuryType], { nullable: true })
    canHeal?: InjuryType[] | null;

    @Field(() => LootRecoveryInput, { nullable: true })
    recovery?: LootRecoveryInput | null;
}
