import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    Min,
    ValidateNested,
} from 'class-validator';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

// la mutation è dell'innkeeper, ma un input enorme non deve mai arrivare alla transazione
export const MAX_OVERRIDE_ENTRIES = 50;

// il GM racconta il combattimento della live (D-04): solo HP, ferite, consumi e magie; premi e XP restano del catalogo
// solo forma: lo 0, i massimi del personaggio e i possessi restano OUTCOME_* del service (C5)
@InputType()
export class ItemUsageInput {
    @Field(() => ID)
    @IsObjectIdHex()
    item: string;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    quantity: number;
}

@InputType()
export class SpellUsageInput {
    @Field(() => ID)
    @IsObjectIdHex()
    spell: string;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    usages: number;
}

@InputType()
export class ParticipantOverrideInput {
    @Field(() => ID)
    @IsObjectIdHex()
    characterId: string;

    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    @Min(0)
    hpAfter?: number | null;

    @Field(() => [InjuryType], { nullable: true })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_OVERRIDE_ENTRIES)
    @IsEnum(InjuryType, { each: true })
    injuries?: InjuryType[] | null;

    @Field(() => [ItemUsageInput], { nullable: true })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_OVERRIDE_ENTRIES)
    @ValidateNested({ each: true })
    @Type(() => ItemUsageInput)
    consumablesUsed?: ItemUsageInput[] | null;

    @Field(() => [SpellUsageInput], { nullable: true })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_OVERRIDE_ENTRIES)
    @ValidateNested({ each: true })
    @Type(() => SpellUsageInput)
    spellsUsed?: SpellUsageInput[] | null;
}

@InputType()
export class CompletePendingRequestInput {
    @Field(() => ID)
    @IsObjectIdHex()
    pendingQuestId: string;

    @Field(() => [ParticipantOverrideInput], { nullable: true })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_OVERRIDE_ENTRIES)
    @ValidateNested({ each: true })
    @Type(() => ParticipantOverrideInput)
    outcomes?: ParticipantOverrideInput[] | null;
}
