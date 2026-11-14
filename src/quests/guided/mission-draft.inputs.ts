import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsInt,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

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
