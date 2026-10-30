import { Field, InputType, Int } from '@nestjs/graphql';
import {
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import { ClassType } from 'src/models/enums/class-type.enum';
import { PronounType } from 'src/models/enums/pronoun-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { SexType } from 'src/models/enums/sex-type.enum';

// tetti di forma generosi sopra i limiti di dominio: sotto il tetto decide il validatore con i suoi codici (C4)
export const NAME_MAX_FORM_LENGTH = 200;
export const BACKGROUND_MAX_FORM_LENGTH = 4000;
export const IMAGE_PATH_MAX_FORM_LENGTH = 2048;

// solo forma: nome, età per razza, background e imagePath https restano del validatore di dominio (C4)
@InputType()
export class CreateCharacterInput {
    @Field(() => String)
    @IsString()
    @MaxLength(NAME_MAX_FORM_LENGTH)
    name: string;

    @Field(() => SexType)
    @IsEnum(SexType)
    sex: SexType;

    @Field(() => PronounType)
    @IsEnum(PronounType)
    pronoun: PronounType;

    @Field(() => RaceType)
    @IsEnum(RaceType)
    race: RaceType;

    @Field(() => ClassType)
    @IsEnum(ClassType)
    classType: ClassType;

    @Field(() => Int)
    @IsInt()
    age: number;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(BACKGROUND_MAX_FORM_LENGTH)
    background?: string | null;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(IMAGE_PATH_MAX_FORM_LENGTH)
    imagePath?: string | null;
}
