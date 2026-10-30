import { InputType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional } from 'class-validator';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { SlotType } from '../enums/slot_type.enum';

@InputType()
export class EquipItemRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;

    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsObjectIdHex()
    itemId?: string;

    @Field(() => SlotType)
    @IsEnum(SlotType)
    slotType: SlotType;
}
