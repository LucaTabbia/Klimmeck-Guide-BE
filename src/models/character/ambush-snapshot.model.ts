import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import {
    AssetQuantity,
    assetQuantitySchemaAt,
} from '../common/asset-quantity.model';
import { Coins, CoinsSchema } from '../common/coins.model';
import { InjuryType } from '../enums/injury-type.enum';
import { QuestOutcome } from '../enums/quest-outcome.enum';
import { TitleType } from '../enums/title-type.enum';
import { QuestEnemy, QuestEnemySchema } from '../quest/quest-enemy.model';
import {
    SpellUsage,
    SpellUsageSchema,
} from '../quest-result/quest-result.model';

// fotografie interne delle imboscate (Phase 15 D-05, D-13): mai sul filo, mai lo schema dei risultati incorporato (Pitfall 5: indici e required sulla collection dei personaggi)

@Schema({ _id: false })
export class AmbushPlanEntry {
    @Prop({ type: Date, required: true })
    at: Date;

    @Prop({ type: Number, required: true })
    km: number;

    // errori di risoluzione: fail-open al terzo (D-18)
    @Prop({ type: Number, default: 0 })
    attempts: number;
}

export const AmbushPlanEntrySchema =
    SchemaFactory.createForClass(AmbushPlanEntry);

@Schema({ _id: false })
export class AmbushCitySnapshot {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true })
    id: Types.ObjectId;

    @Prop({ type: String, required: true })
    name: string;
}

export const AmbushCitySnapshotSchema =
    SchemaFactory.createForClass(AmbushCitySnapshot);

@Schema({ _id: false })
export class AmbushReportSnapshot {
    @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
    resultId: Types.ObjectId;

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    user: Types.ObjectId;

    @Prop({
        type: String,
        enum: [QuestOutcome.success, QuestOutcome.failure],
        required: true,
    })
    outcome: QuestOutcome;

    @Prop({ type: Date, required: true })
    at: Date;

    @Prop({ type: AmbushCitySnapshotSchema, required: true })
    nearCity: AmbushCitySnapshot;

    // null in vittoria (D-13)
    @Prop({ type: AmbushCitySnapshotSchema, default: null })
    reachedCity: AmbushCitySnapshot | null;

    @Prop({ type: [QuestEnemySchema], default: [] })
    enemies: QuestEnemy[];

    @Prop({ type: Number, required: true })
    hpBefore: number;

    @Prop({ type: Number, required: true })
    hpAfter: number;

    @Prop({ type: Number, required: true })
    maxLifePoints: number;

    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    injuriesAdded: InjuryType[];

    @Prop({
        type: [
            assetQuantitySchemaAt(
                'status.activeTravel.ambushReports.consumablesUsed',
            ),
        ],
        default: [],
    })
    consumablesUsed: AssetQuantity[];

    @Prop({ type: [SpellUsageSchema], default: [] })
    spellsUsed: SpellUsage[];

    @Prop({ type: CoinsSchema, required: true })
    coins: Coins;

    @Prop({ type: Number, required: true })
    xpGained: number;

    @Prop({ type: Number, required: true })
    xpBefore: number;

    @Prop({ type: Number, required: true })
    xpAfter: number;

    @Prop({ type: Number, required: true })
    levelBefore: number;

    @Prop({ type: Number, required: true })
    levelAfter: number;

    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    titleBefore: TitleType;

    @Prop({ type: String, enum: Object.values(TitleType), required: true })
    titleAfter: TitleType;
}

export const AmbushReportSnapshotSchema =
    SchemaFactory.createForClass(AmbushReportSnapshot);
