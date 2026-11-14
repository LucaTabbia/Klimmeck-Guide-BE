import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { CoinsInput } from 'src/models/common/coins.model';
import {
    MAX_OVERRIDE_ENTRIES,
    ParticipantOverrideInput,
} from 'src/models/request/complete-pending-request.model';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { MAX_PRIZE_ITEM_QUANTITY } from './mission-draft-prefill';
import { MissionDraftStep } from './mission-draft.model';

// tetti tecnici del flusso guidato (D-31): una bozza enorme non arriva mai al motore
export const MAX_MISSION_FIGHTS = 10;
export const MAX_FIGHT_ENEMIES = 10;
export const MAX_ENEMY_QUANTITY = 20;
// tetto tecnico largo: un blocco precompilato si salva sempre invariato (D-22)
export const MAX_PRIZE_ITEMS = 500;
// tetto tecnico, non di prodotto (D-15 resta «liberi»): il portafoglio non esce dall'Int del filo
export const MAX_PRIZE_AMOUNT = 9_999_999;

@InputType()
export class MissionEnemyInput {
    @Field(() => ID)
    @IsObjectIdHex()
    enemy: string;

    @Field(() => Int)
    @IsInt()
    @Min(1)
    @Max(MAX_ENEMY_QUANTITY)
    quantity: number;
}

@InputType()
export class SimulateMissionFightInput {
    @Field(() => ID)
    @IsObjectIdHex()
    pendingQuestId: string;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    @Max(MAX_MISSION_FIGHTS - 1)
    fightIndex: number;

    @Field(() => [MissionEnemyInput])
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_FIGHT_ENEMIES)
    @ValidateNested({ each: true })
    @Type(() => MissionEnemyInput)
    enemies: MissionEnemyInput[];
}

@InputType()
export class MissionFightInput {
    @Field(() => [MissionEnemyInput])
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_FIGHT_ENEMIES)
    @ValidateNested({ each: true })
    @Type(() => MissionEnemyInput)
    enemies: MissionEnemyInput[];

    // effetto completo per personaggio; assente = correzioni invariate (D-06, D-14)
    @Field(() => [ParticipantOverrideInput], { nullable: true })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_OVERRIDE_ENTRIES)
    @ValidateNested({ each: true })
    @Type(() => ParticipantOverrideInput)
    corrections?: ParticipantOverrideInput[] | null;
}

@InputType()
export class MissionPrizeItemInput {
    @Field(() => ID)
    @IsObjectIdHex()
    item: string;

    @Field(() => Int)
    @IsInt()
    @Min(1)
    @Max(MAX_PRIZE_ITEM_QUANTITY)
    quantity: number;
}

// solo validazione: sul filo resta CoinsInput (SDL invariato) e il negozio non eredita il tetto dei premi
class MissionPrizeCoinsInput extends CoinsInput {
    @Max(MAX_PRIZE_AMOUNT)
    declare gold: number;

    @Max(MAX_PRIZE_AMOUNT)
    declare silver: number;

    @Max(MAX_PRIZE_AMOUNT)
    declare copper: number;
}

// monete e xp liberi entro il tetto tecnico (D-15, D-31); oggetti, pet e magie rivalidati col filtro del titolo (D-07)
@InputType()
export class MissionPrizeInput {
    @Field(() => ID)
    @IsObjectIdHex()
    characterId: string;

    @Field(() => CoinsInput)
    @ValidateNested()
    @Type(() => MissionPrizeCoinsInput)
    coins: CoinsInput;

    @Field(() => Boolean)
    @IsBoolean()
    cure: boolean;

    @Field(() => [MissionPrizeItemInput])
    @IsArray()
    @ArrayMaxSize(MAX_PRIZE_ITEMS)
    @ValidateNested({ each: true })
    @Type(() => MissionPrizeItemInput)
    items: MissionPrizeItemInput[];

    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsObjectIdHex()
    pet?: string | null;

    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsObjectIdHex()
    spell?: string | null;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    @Max(MAX_PRIZE_AMOUNT)
    xp: number;
}

// sezioni presenti sostituiscono quelle salvate, nessun ordine dei passi (D-18)
@InputType()
export class SaveMissionDraftInput {
    @Field(() => ID)
    @IsObjectIdHex()
    pendingQuestId: string;

    @Field(() => MissionDraftStep, { nullable: true })
    @IsOptional()
    @IsEnum(MissionDraftStep)
    step?: MissionDraftStep | null;

    @Field(() => ID, { nullable: true })
    @IsOptional()
    @IsObjectIdHex()
    place?: string | null;

    @Field(() => [MissionFightInput], { nullable: true })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_MISSION_FIGHTS)
    @ValidateNested({ each: true })
    @Type(() => MissionFightInput)
    fights?: MissionFightInput[] | null;

    // limitata dai partecipanti della bozza, nessun tetto di lista (D-22)
    @Field(() => [MissionPrizeInput], { nullable: true })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MissionPrizeInput)
    prizes?: MissionPrizeInput[] | null;
}
