import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class CommonResponse {
    @Field(() => String)
    response: String;

    @Field(() => Boolean)
    successful: boolean;
}