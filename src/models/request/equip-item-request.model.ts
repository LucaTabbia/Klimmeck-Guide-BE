import { InputType, Field } from "@nestjs/graphql";
import { SlotType } from "../enums/slot_type.enum";

@InputType()
export class EquipItemRequest {
    @Field(() => String)
    id: string;

    @Field(() => String, { nullable: true })
    itemId?: string;

    @Field(() => SlotType)
    slotType: SlotType;
}