import { Field, Int, ObjectType } from '@nestjs/graphql';

// risposta della corsa forzata dall'oste (D-16): 0 se il mondo è già pieno
@ObjectType()
export class GenerateQuestsResult {
    @Field(() => Int)
    created: number;
}
