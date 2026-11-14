import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    MAX_OVERRIDE_ENTRIES,
    ParticipantOverrideInput,
} from 'src/models/request/complete-pending-request.model';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { MissionDraftStep } from './mission-draft.model';

// tetti tecnici del flusso guidato (D-31): una bozza enorme non arriva mai al motore
export const MAX_MISSION_FIGHTS = 10;
export const MAX_FIGHT_ENEMIES = 10;
export const MAX_ENEMY_QUANTITY = 20;

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
}
