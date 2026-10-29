import { InputType, Field, Int } from '@nestjs/graphql';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

@InputType()
export class EquipSpellRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;

    @Field(() => String)
    @IsObjectIdHex()
    spellId: string;

    // deprecato e senza decoratori: la whitelist lo scarta prima del service (D-01)
    @Field(() => Int, { nullable: true })
    usages?: number;
}
