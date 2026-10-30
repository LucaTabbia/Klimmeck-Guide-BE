import { InputType, Field } from '@nestjs/graphql';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

@InputType()
export class UseSpellRequest {
    @Field(() => String)
    @IsObjectIdHex()
    characterId: string;

    @Field(() => String)
    @IsObjectIdHex()
    spellId: string;
}
