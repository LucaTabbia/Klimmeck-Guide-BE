import { InputType, Field } from "@nestjs/graphql";
import { AssetQuantityInput } from "./asset-quantity.model";

@InputType()
export class TransactionItems {
    @Field(() => [AssetQuantityInput])
    lootAssets: AssetQuantityInput[];

    @Field(() => [AssetQuantityInput])
    equipAssets: AssetQuantityInput[];
}