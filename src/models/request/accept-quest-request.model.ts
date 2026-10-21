import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class AcceptQuestRequest {
    @Field(() => String)
    id: string;

    @Field(() => String)
    questId: string;
}
