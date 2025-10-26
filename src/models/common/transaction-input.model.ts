import { InputType, Field } from "@nestjs/graphql";
import { CoinsInput } from "./coins.model";
import { TransactionItems } from "./transaction-items.model";

@InputType()
export class TransactionInput {
    @Field(() => String)
    id: string;

    @Field(() => TransactionItems)
    boughtItems: TransactionItems;

    @Field(() => TransactionItems)
    soldItems: TransactionItems;

    @Field(() => CoinsInput)
    total: CoinsInput;

    @Field(() => Boolean)
    isTotalPositive: boolean;
}