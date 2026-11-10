import { ObjectType, Field, Float, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import {
    AssetQuantity,
    AssetQuantityInput,
    assetQuantitySchemaAt,
} from '../common/asset-quantity.model';
import { Coins, CoinsInput, CoinsSchema } from '../common/coins.model';
import { InjuryType } from '../enums/injury-type.enum';
import { Pet } from '../pet.model';
import { Spell } from '../spell.model';

// cura esplicita della quest (Phase 18 D-01): quota di vita come tetto e ferite guarite; assente o null = la quest non cura
@ObjectType()
@Schema({ _id: false })
export class QuestCure {
    @Field(() => Float)
    @Prop({ type: Number, required: true, min: 0, max: 1 })
    lifePointsShare: number;

    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    canHeal: InjuryType[];
}

export const QuestCureSchema = SchemaFactory.createForClass(QuestCure);

@ObjectType()
@Schema({ _id: false })
export class QuestPrizes {
    @Field(() => Coins, { nullable: true })
    @Prop({ type: CoinsSchema, default: null })
    prizeCoins?: Coins;

    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    xpPrize?: number | null;

    // path assoluti legati ai nomi dei campi di Quest (requirements, prizes): rinominarli richiede di aggiornare anche questi
    @Field(() => AssetQuantity, { nullable: true })
    @Prop({ type: assetQuantitySchemaAt('prizes.prizeItem') })
    prizeItem?: AssetQuantity | null;

    @Field(() => [AssetQuantity])
    @Prop({ type: [assetQuantitySchemaAt('prizes.randomLoot')] })
    randomLoot: AssetQuantity[];

    // magia insegnata da una study (D-17): il catalogo la mette solo sulle study di Valantar; orfano = null sul filo
    @Field(() => Spell, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        default: null,
    })
    spell?: Types.ObjectId | Spell | null;

    // pet premio (D-21): il generatore lo mette solo sui boss all'1%, la vittoria lo tira al 20% per vincitore; orfano = null sul filo
    @Field(() => Pet, { nullable: true })
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Pet.name, default: null })
    pet?: Types.ObjectId | Pet | null;

    @Field(() => QuestCure, { nullable: true })
    @Prop({ type: QuestCureSchema, default: null })
    cure?: QuestCure | null;

    // D-31: la study di Valantar sorteggia la magia alla risoluzione; campo interno, mai nello SDL
    @Prop({ type: Boolean, default: false })
    spellDraw: boolean;
}

export type QuestPrizesDocument = QuestPrizes & Document;
export const QuestPrizesSchema = SchemaFactory.createForClass(QuestPrizes);

@InputType()
export class QuestCureInput {
    @Field(() => Float)
    lifePointsShare: number;

    @Field(() => [InjuryType])
    canHeal: InjuryType[];
}

@InputType()
export class QuestPrizesInput {
    @Field(() => CoinsInput, { nullable: true })
    prizeCoins?: CoinsInput;

    @Field(() => Int, { nullable: true })
    xpPrize?: number | null;

    @Field(() => ID, { nullable: true })
    prizeItem?: string | null;

    @Field(() => [AssetQuantityInput], { nullable: true })
    randomLoot?: AssetQuantityInput[];

    @Field(() => ID, { nullable: true })
    spell?: string | null;

    @Field(() => QuestCureInput, { nullable: true })
    cure?: QuestCureInput | null;
}
