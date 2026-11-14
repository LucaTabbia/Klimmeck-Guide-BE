import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { Character } from 'src/models/character/character.model';
import { Enemy } from 'src/models/enemy.model';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { PendingQuest } from 'src/models/pending-quest.model';
import { Pet } from 'src/models/pet.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
import { Spell } from 'src/models/spell.model';

// bozza del flusso guidato (D-09, D-18): mai su un handler senza @Roles(innkeeper)

export enum MissionDraftStep {
    teleport = 'teleport',
    fights = 'fights',
    prizes = 'prizes',
    recap = 'recap',
}

export enum MissionFightVerdict {
    success = 'success',
    failure = 'failure',
}

const INJURY_TYPES = Object.values(InjuryType);
const PRIZE_ITEM_TYPES = ['EquipmentItem', 'LootItem'];

@Schema({ _id: false })
export class MissionDraftParticipant {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Character.name,
        required: true,
    })
    character: Types.ObjectId;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: PendingQuest.name,
        required: true,
    })
    pendingQuest: Types.ObjectId;

    // fotografato all'avvio; vuoto ammesso (un required rifiuterebbe la stringa vuota)
    @Prop({ type: String, default: '' })
    name: string;

    @Prop({ type: String, required: true })
    title: string;

    @Prop({ type: Number, required: true })
    maxLifePoints: number;
}

export const MissionDraftParticipantSchema = SchemaFactory.createForClass(
    MissionDraftParticipant,
);

@Schema({ _id: false })
export class MissionItemUsageRecord {
    @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
    item: Types.ObjectId;

    @Prop({ type: Number, required: true })
    quantity: number;
}

export const MissionItemUsageRecordSchema = SchemaFactory.createForClass(
    MissionItemUsageRecord,
);

@Schema({ _id: false })
export class MissionSpellUsageRecord {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        required: true,
    })
    spell: Types.ObjectId;

    @Prop({ type: Number, required: true })
    usages: number;
}

export const MissionSpellUsageRecordSchema = SchemaFactory.createForClass(
    MissionSpellUsageRecord,
);

@Schema({ _id: false })
export class MissionFightEffectsRecord {
    @Prop({ type: Number, required: true })
    hpAfter: number;

    @Prop({ type: [String], enum: INJURY_TYPES, default: [] })
    injuriesAdded: InjuryType[];

    @Prop({ type: [MissionItemUsageRecordSchema], default: [] })
    consumablesUsed: MissionItemUsageRecord[];

    @Prop({ type: [MissionSpellUsageRecordSchema], default: [] })
    spellsUsed: MissionSpellUsageRecord[];
}

export const MissionFightEffectsRecordSchema = SchemaFactory.createForClass(
    MissionFightEffectsRecord,
);

@Schema({ _id: false })
export class MissionFightOutcomeRecord {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Character.name,
        required: true,
    })
    character: Types.ObjectId;

    @Prop({ type: Number, required: true })
    hpBefore: number;

    @Prop({ type: [String], enum: INJURY_TYPES, default: [] })
    injuriesBefore: InjuryType[];

    @Prop({ type: [MissionItemUsageRecordSchema], default: [] })
    consumablesAvailable: MissionItemUsageRecord[];

    @Prop({ type: [MissionSpellUsageRecordSchema], default: [] })
    spellsAvailable: MissionSpellUsageRecord[];

    @Prop({ type: MissionFightEffectsRecordSchema, default: null })
    simulated: MissionFightEffectsRecord | null;

    @Prop({ type: MissionFightEffectsRecordSchema, default: null })
    corrected: MissionFightEffectsRecord | null;
}

export const MissionFightOutcomeRecordSchema = SchemaFactory.createForClass(
    MissionFightOutcomeRecord,
);

@Schema({ _id: false })
export class MissionFightEnemyRecord {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Enemy.name,
        required: true,
    })
    enemy: Types.ObjectId;

    @Prop({ type: Number, required: true })
    quantity: number;
}

export const MissionFightEnemyRecordSchema = SchemaFactory.createForClass(
    MissionFightEnemyRecord,
);

@Schema({ _id: false })
export class MissionFightRecord {
    @Prop({ type: [MissionFightEnemyRecordSchema], default: [] })
    enemies: MissionFightEnemyRecord[];

    @Prop({
        type: String,
        enum: Object.values(MissionFightVerdict),
        default: null,
    })
    verdict: MissionFightVerdict | null;

    @Prop({ type: [MissionFightOutcomeRecordSchema], default: [] })
    outcomes: MissionFightOutcomeRecord[];
}

export const MissionFightRecordSchema =
    SchemaFactory.createForClass(MissionFightRecord);

@Schema({ _id: false })
export class MissionPrizeItemRecord {
    @Prop({ type: String, enum: PRIZE_ITEM_TYPES, required: true })
    itemType: 'EquipmentItem' | 'LootItem';

    @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
    item: Types.ObjectId;

    @Prop({ type: Number, required: true })
    quantity: number;
}

export const MissionPrizeItemRecordSchema = SchemaFactory.createForClass(
    MissionPrizeItemRecord,
);

@Schema({ _id: false })
export class MissionPrizeCoinsRecord {
    @Prop({ type: Number, default: 0 })
    gold: number;

    @Prop({ type: Number, default: 0 })
    silver: number;

    @Prop({ type: Number, default: 0 })
    copper: number;
}

export const MissionPrizeCoinsRecordSchema = SchemaFactory.createForClass(
    MissionPrizeCoinsRecord,
);

@Schema({ _id: false })
export class MissionPrizeCureRecord {
    @Prop({ type: Number, required: true })
    lifePointsShare: number;

    @Prop({ type: [String], enum: INJURY_TYPES, default: [] })
    canHeal: InjuryType[];
}

export const MissionPrizeCureRecordSchema = SchemaFactory.createForClass(
    MissionPrizeCureRecord,
);

@Schema({ _id: false })
export class MissionPrizeRecord {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Character.name,
        required: true,
    })
    character: Types.ObjectId;

    @Prop({ type: MissionPrizeCoinsRecordSchema, required: true })
    coins: MissionPrizeCoinsRecord;

    @Prop({ type: Number, default: 0 })
    xp: number;

    @Prop({ type: [MissionPrizeItemRecordSchema], default: [] })
    items: MissionPrizeItemRecord[];

    @Prop({ type: MongooseSchema.Types.ObjectId, ref: Pet.name, default: null })
    pet: Types.ObjectId | null;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Spell.name,
        default: null,
    })
    spell: Types.ObjectId | null;

    @Prop({ type: MissionPrizeCureRecordSchema, default: null })
    cure: MissionPrizeCureRecord | null;
}

export const MissionPrizeRecordSchema =
    SchemaFactory.createForClass(MissionPrizeRecord);

@Schema({ collection: 'missiondrafts' })
export class MissionDraft {
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: Quest.name,
        required: true,
    })
    quest: Types.ObjectId;

    @Prop({ type: String, enum: ['story', 'worldMission'], required: true })
    questType: 'story' | 'worldMission';

    @Prop({ type: [MissionDraftParticipantSchema], default: [] })
    participants: MissionDraftParticipant[];

    @Prop({
        type: String,
        enum: Object.values(MissionDraftStep),
        default: MissionDraftStep.teleport,
    })
    step: MissionDraftStep;

    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: PointOfInterest.name,
        default: null,
    })
    place: Types.ObjectId | null;

    @Prop({ type: [MissionFightRecordSchema], default: [] })
    fights: MissionFightRecord[];

    @Prop({ type: [MissionPrizeRecordSchema], default: [] })
    prizes: MissionPrizeRecord[];

    @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
    startedBy: Types.ObjectId | null;

    @Prop({ type: Date, required: true })
    startedAt: Date;

    @Prop({ type: Date, required: true })
    updatedAt: Date;

    // solo Mongoose: ogni scrittura lo incrementa, il completamento cancella solo la revisione che ha letto (B-01)
    @Prop({ type: Number, default: 0 })
    rev: number;
}

export type MissionDraftRecord = MissionDraft & { _id: Types.ObjectId };
export const MissionDraftSchema = SchemaFactory.createForClass(MissionDraft);

export const MISSION_DRAFT_PENDING_QUEST_INDEX = 'mission_draft_pending_quest';
export const MISSION_DRAFT_CHARACTER_INDEX = 'mission_draft_character';

// una bozza per richiesta o per gruppo della stessa worldMission: due avvii collidono su qualunque PendingQuest condivisa (D-18)
MissionDraftSchema.index(
    { 'participants.pendingQuest': 1 },
    { name: MISSION_DRAFT_PENDING_QUEST_INDEX, unique: true },
);

MissionDraftSchema.index(
    { 'participants.character': 1 },
    { name: MISSION_DRAFT_CHARACTER_INDEX },
);
