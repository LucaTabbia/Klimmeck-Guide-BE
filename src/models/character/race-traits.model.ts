import { Field, Int, ObjectType } from '@nestjs/graphql';
import { RaceType } from 'src/models/enums/race-type.enum';

@ObjectType()
export class RaceTraits {
    @Field(() => RaceType)
    race: RaceType;

    @Field(() => Int)
    minAge: number;

    @Field(() => Int)
    maxAge: number;
}
