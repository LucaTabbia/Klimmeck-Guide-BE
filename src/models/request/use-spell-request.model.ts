import { InputType, Field } from "@nestjs/graphql";

@InputType()
export class UseSpellRequest {
    @Field(() => String)
    characterId: string;

    @Field(() => String)
    spellId: string;
}

