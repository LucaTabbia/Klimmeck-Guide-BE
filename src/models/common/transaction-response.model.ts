import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class TransactionResponse {
    @Field(() => String)
    response: String;

    @Field(() => Boolean)
    successful: boolean;
}