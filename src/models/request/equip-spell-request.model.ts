import { InputType, Field, Int } from "@nestjs/graphql";

@InputType()
export class EquipSpellRequest {
    @Field(() => String)
    id: string;

    @Field(() => String)
    spellId: string;

    @Field(() => Int, { nullable: true })
    usages?: number;
}