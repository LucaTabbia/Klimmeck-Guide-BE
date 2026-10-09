import { Field, InputType, Int } from '@nestjs/graphql';
import { ClassType } from 'src/models/enums/class-type.enum';
import { PronounType } from 'src/models/enums/pronoun-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { SexType } from 'src/models/enums/sex-type.enum';

@InputType()
export class CreateCharacterInput {
    @Field(() => String)
    name: string;

    @Field(() => SexType)
    sex: SexType;

    @Field(() => PronounType)
    pronoun: PronounType;

    @Field(() => RaceType)
    race: RaceType;

    @Field(() => ClassType)
    classType: ClassType;

    @Field(() => Int)
    age: number;

    @Field(() => String, { nullable: true })
    background?: string | null;

    @Field(() => String, { nullable: true })
    imagePath?: string | null;
}
