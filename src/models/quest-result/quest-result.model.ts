import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import {
    AssetQuantity,
    assetQuantitySchemaAt,
} from '../common/asset-quantity.model';
import { Coins, CoinsSchema } from '../common/coins.model';
import { Enemy } from '../enemy.model';
import { InjuryType } from '../enums/injury-type.enum';
import { QuestOutcome } from '../enums/quest-outcome.enum';
import { TitleType } from '../enums/title-type.enum';
import { Spell } from '../spell.model';

// fotografia della quest: il foglio esiti resta leggibile anche quando la quest sparisce dalla board (D-06)
@ObjectType()
@Schema({ _id: false })
export class QuestResultQuest {
    @Field(() => ID)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Quest', required: true })
    id: Types.ObjectId;

    @Field(() => String)
    @Prop({ type: String, required: true })
    type: string;

    @Field(() => String)
    @Prop({ type: String, required: true })
    title: string;
}

export const QuestResultQuestSchema =
    SchemaFactory.createForClass(QuestResultQuest);

@ObjectType()
@Schema({ _id: false })
export class SpellUsage {
    // orfano tollerato sul filo
    @Field(() => Spell, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        required: true,
    })
    spell: Types.ObjectId | Spell | null;

    @Field(() => Int)
    @Prop({ type: Number, required: true, min: 1 })
    usages: number;
}

export const SpellUsageSchema = SchemaFactory.createForClass(SpellUsage);

@ObjectType()
@Schema({ _id: false })
export class QuestRewards {
    @Field(() => Coins)
    @Prop({ type: CoinsSchema, required: true })
    coins: Coins;

    // prizeItem + loot estratto (D-16)
    @Field(() => [AssetQuantity])
    @Prop({ type: [assetQuantitySchemaAt('rewards.items')], default: [] })
    items: AssetQuantity[];
}

export const QuestRewardsSchema = SchemaFactory.createForClass(QuestRewards);

// un risultato per personaggio partecipante (D-19): unico tipo per ogni esito, persistito nella stessa transazione dell'esito (D-21)
@ObjectType()
@Schema({ collection: 'questresults' })
export class QuestResult {
    @Field(() => ID)
    id: string;

    @Field(() => ID)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Character',
        required: true,
    })
    character: Types.ObjectId;

    // proprietario del risultato anche dopo la morte del personaggio (D-20)
    @Field(() => ID)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    user: Types.ObjectId;

    @Field(() => QuestResultQuest)
    @Prop({ type: QuestResultQuestSchema, required: true })
    quest: QuestResultQuest;

    @Field(() => QuestOutcome)
    @Prop({ type: String, enum: Object.values(QuestOutcome), required: true })
    outcome: QuestOutcome;

    @Field(() => Date)
    @Prop({ type: Date, required: true })
    resolvedAt: Date;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    hpBefore: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    hpAfter: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    maxLifePoints: number;

    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    injuriesAdded: InjuryType[];

    @Field(() => [AssetQuantity])
    @Prop({ type: [assetQuantitySchemaAt('consumablesUsed')], default: [] })
    consumablesUsed: AssetQuantity[];

    @Field(() => [SpellUsage])
    @Prop({ type: [SpellUsageSchema], default: [] })
    spellsUsed: SpellUsage[];

    @Field(() => QuestRewards)
    @Prop({ type: QuestRewardsSchema, required: true })
    rewards: QuestRewards;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    xpGained: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    xpBefore: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    xpAfter: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    levelBefore: number;

    @Field(() => Int)
    @Prop({ type: Number, required: true })
    levelAfter: number;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    titleBefore: TitleType;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    titleAfter: TitleType;

    @Field(() => Spell, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        default: null,
    })
    spellLearned?: Types.ObjectId | Spell | null;

    @Field(() => Enemy, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Enemy.name,
        default: null,
    })
    enemy?: Types.ObjectId | Enemy | null;

    // "hai salvato X" sul foglio del soccorritore
    @Field(() => ID, { nullable: true })
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: 'Character',
        default: null,
    })
    rescuedCharacter?: Types.ObjectId | null;
}

export type QuestResultDocument = QuestResult & Document;
export const QuestResultSchema = SchemaFactory.createForClass(QuestResult);
