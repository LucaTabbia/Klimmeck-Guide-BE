import { Field, Float, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class PathResponse {
    @Field(() => Float)
    distance: number;

    @Field(() => Float)
    time: number;
}