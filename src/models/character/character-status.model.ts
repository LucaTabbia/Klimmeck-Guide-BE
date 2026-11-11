import { ObjectType, Field, Int, InputType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Coins, CoinsInput, CoinsSchema } from '../common/coins.model';
import { InjuryType } from '../enums/injury-type.enum';
import { TitleType } from '../enums/title-type.enum';
import { Enemy } from '../enemy.model';
import { Lore } from '../lore.model';
import { PointOfInterest } from '../point-of-interest.model';
import { ActiveTravel, ActiveTravelSchema } from './active-travel.model';
import { AwaitingAid, AwaitingAidSchema } from './awaiting-aid.model';
import { SpellState, SpellStateSchema } from './spell-state.model';

@ObjectType()
@Schema({ _id: false })
export class CharacterStatus {
    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    xp: number;

    @Field(() => Int)
    @Prop({ type: Number, default: 0 })
    level: number;

    @Field(() => PointOfInterest)
    @Prop({
        type: MongooseSchema.Types.ObjectId,
        ref: PointOfInterest.name,
        required: true,
    })
    location: Types.ObjectId | PointOfInterest;

    // null = nessun viaggio; scritto solo dal server (startTravel, accettazione quest, completamento, teleport)
    @Field(() => ActiveTravel, { nullable: true })
    @Prop({ type: ActiveTravelSchema, default: null })
    activeTravel?: ActiveTravel | null;

    // null = libero; valorizzato al combattimento perso, azzerato dal soccorso riuscito (D-07, D-09)
    @Field(() => AwaitingAid, { nullable: true })
    @Prop({ type: AwaitingAidSchema, default: null })
    awaitingAid?: AwaitingAid | null;

    @Field(() => String)
    @Prop({ type: String, enum: Object.values(TitleType) })
    title: TitleType;

    @Field(() => [InjuryType])
    @Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
    injuries: InjuryType[];

    // l'unica lista delle magie: una voce per magia conosciuta, in ordine di apprendimento; equipaggiata = flag della voce (Phase 19 D-07, D-16)
    @Field(() => [SpellState])
    @Prop({ type: [SpellStateSchema], default: [] })
    spellStates: SpellState[];

    // conoscenza del personaggio (Phase 16 D-01): soli id sul filo, scritti solo con add-to-set; knownEnemies è interno
    @Field(() => [ID])
    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Lore.name,
        default: [],
    })
    unlockedLore: Types.ObjectId[];

    @Prop({
        type: [MongooseSchema.Types.ObjectId],
        ref: Enemy.name,
        default: [],
    })
    knownEnemies: Types.ObjectId[];

    @Field(() => Coins)
    @Prop({ type: CoinsSchema })
    coins: Coins;

    @Field(() => Int)
    @Prop({ type: Number })
    currentLifePoints: number;

    @Field(() => Int)
    @Prop({ type: Number })
    maxLifePoints: number;

    // fine della ricarica delle pozioni (Phase 18 D-15): una sola data per personaggio, confrontata all'uso; null = nessuna ricarica; il combattimento non la legge né la scrive (D-16)
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    potionRecoveryUntil?: Date | null;

    // fine della prigione dopo un arresto (quick 261110-cgd): null o passata = libero; nessuno sweep la azzera
    @Field(() => Date, { nullable: true })
    @Prop({ type: Date, default: null })
    imprisonedUntil?: Date | null;
}

export type CharacterStatusDocument = CharacterStatus & Document;
export const CharacterStatusSchema =
    SchemaFactory.createForClass(CharacterStatus);

@InputType()
export class CharacterStatusInput {
    @Field(() => Int, { nullable: true })
    xp?: number;

    @Field(() => Int, { nullable: true })
    level?: number;

    @Field(() => ID)
    location: string;

    @Field(() => String, { nullable: true })
    title?: TitleType;

    @Field(() => [InjuryType])
    injuries: InjuryType[];

    @Field(() => CoinsInput)
    coins: CoinsInput;

    @Field(() => Int, { nullable: true })
    currentLifePoints?: number;

    @Field(() => Int, { nullable: true })
    maxLifePoints?: number;
}
