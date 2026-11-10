import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import {
    AssetQuantity,
    assetQuantitySchemaAt,
} from '../common/asset-quantity.model';
import { Coins, CoinsSchema } from '../common/coins.model';
import { InjuryType } from '../enums/injury-type.enum';
import { Lore } from '../lore.model';
import { QuestOutcome } from '../enums/quest-outcome.enum';
import { QuestResultKind } from '../enums/quest-result-kind.enum';
import { Pet } from '../pet.model';
import { QuestEnemy, QuestEnemySchema } from '../quest/quest-enemy.model';
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

// report d'imboscata (Phase 15 D-14): nearCity = città del POI più vicino al punto, reachedCity = città raggiunta dopo la sconfitta, null in vittoria
@ObjectType()
@Schema({ _id: false })
export class AmbushCity {
    @Field(() => ID)
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
    id: Types.ObjectId;

    @Field(() => String)
    @Prop({ type: String, required: true })
    name: string;
}

export const AmbushCitySchema = SchemaFactory.createForClass(AmbushCity);

@ObjectType()
@Schema({ _id: false })
export class AmbushReport {
    @Field(() => Date)
    @Prop({ type: Date, required: true })
    at: Date;

    @Field(() => AmbushCity)
    @Prop({ type: AmbushCitySchema, required: true })
    nearCity: AmbushCity;

    @Field(() => AmbushCity, { nullable: true })
    @Prop({ type: AmbushCitySchema, default: null })
    reachedCity: AmbushCity | null;
}

export const AmbushReportSchema = SchemaFactory.createForClass(AmbushReport);

const isAmbushResult = function (this: { kind?: string }): boolean {
    return this.kind === QuestResultKind.ambush;
};

const isQuestResult = function (this: { kind?: string }): boolean {
    return this.kind !== QuestResultKind.ambush;
};

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

    // pet ottenuto dal tiro del 20% (D-21): null se non vinto o già posseduto
    @Field(() => Pet, { nullable: true })
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Pet.name, default: null })
    pet?: Types.ObjectId | Pet | null;
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

    @Field(() => QuestResultKind)
    @Prop({
        type: String,
        enum: Object.values(QuestResultKind),
        default: QuestResultKind.quest,
    })
    kind: QuestResultKind;

    // null se e solo se kind == ambush: l'unica modifica non additiva della fase, dichiarata nel handoff
    @Field(() => QuestResultQuest, { nullable: true })
    @Prop({
        type: QuestResultQuestSchema,
        default: null,
        required: isQuestResult,
    })
    quest: QuestResultQuest | null;

    @Field(() => AmbushReport, { nullable: true })
    @Prop({ type: AmbushReportSchema, default: null, required: isAmbushResult })
    ambush: AmbushReport | null;

    @Field(() => QuestOutcome)
    @Prop({ type: String, enum: Object.values(QuestOutcome), required: true })
    outcome: QuestOutcome;

    @Field(() => Date)
    @Prop({ type: Date, required: true })
    resolvedAt: Date;

    // nullo finché il giocatore non chiude il foglio (D-04): il default lo scrive l'unico scrittore dei risultati
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    acknowledgedAt?: Date | null;

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

    // ferite tolte da questo esito (Phase 18 D-08): la FE le elenca accanto a hpBefore e hpAfter
    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    injuriesHealed: InjuryType[];

    @Field(() => [AssetQuantity])
    @Prop({ type: [assetQuantitySchemaAt('consumablesUsed')], default: [] })
    consumablesUsed: AssetQuantity[];

    @Field(() => [SpellUsage])
    @Prop({ type: [SpellUsageSchema], default: [] })
    spellsUsed: SpellUsage[];

    // tappe superate e totali, solo dalle dungeon (D-12): null per ogni altro tipo
    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    stagesCleared?: number | null;

    @Field(() => Int, { nullable: true })
    @Prop({ type: Number, default: null })
    stagesTotal?: number | null;

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

    // sole lore nuove di questo esito (Phase 16 D-09): mai filtrate per viewer, sbloccate per costruzione
    @Field(() => [Lore])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Lore.name,
        default: [],
    })
    loreUnlocked: (Types.ObjectId | Lore)[];

    @Field(() => [QuestEnemy])
    @Prop({ type: [QuestEnemySchema], default: [] })
    enemies: QuestEnemy[];

    // "avete salvato X, Y" sul foglio di ogni soccorritore
    @Field(() => [ID])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: 'Character',
        default: [],
    })
    rescuedCharacters: Types.ObjectId[];
}

export type QuestResultDocument = QuestResult & Document;
export const QuestResultSchema = SchemaFactory.createForClass(QuestResult);

export const QUEST_RESULT_UNACKNOWLEDGED_INDEX = 'quest_result_unacknowledged';
// lista dei non confermati per utente, dal più vecchio, senza ordinamento in memoria (D-05)
QuestResultSchema.index(
    { user: 1, acknowledgedAt: 1, resolvedAt: 1, _id: 1 },
    { name: QUEST_RESULT_UNACKNOWLEDGED_INDEX },
);
