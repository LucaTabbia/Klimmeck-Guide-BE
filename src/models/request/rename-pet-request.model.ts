import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

// tetto di forma sul filo contro i payload enormi: la regola vera del nome è nel dominio (D-31)
const RENAME_PET_NAME_WIRE_MAX_LENGTH = 200;

@InputType()
export class RenamePetRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(RENAME_PET_NAME_WIRE_MAX_LENGTH)
    name?: string | null;

    @Field(() => String)
    @IsObjectIdHex()
    petId: string;
}
