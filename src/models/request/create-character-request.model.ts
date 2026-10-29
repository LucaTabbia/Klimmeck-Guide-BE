import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ClassType } from 'src/models/enums/class-type.enum';
import { PronounType } from 'src/models/enums/pronoun-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { SexType } from 'src/models/enums/sex-type.enum';

// solo forma: nome, età per razza, background e imagePath https restano del validatore di dominio (C4)
@InputType()
export class CreateCharacterInput {
    @Field(() => String)
    @IsString()
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
    background?: string | null;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    imagePath?: string | null;
}
