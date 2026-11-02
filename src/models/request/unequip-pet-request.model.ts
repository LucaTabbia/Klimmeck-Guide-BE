import { Field, InputType } from '@nestjs/graphql';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

@InputType()
export class UnequipPetRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;
}
