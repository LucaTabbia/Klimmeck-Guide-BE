import { InputType, Field } from "@nestjs/graphql";
import { AssetQuantityInput } from "../common/asset-quantity.model";

@InputType()
export class TransactionItems {
    @Field(() => [AssetQuantityInput])
    lootAssets: AssetQuantityInput[];

    @Field(() => [AssetQuantityInput])
    equipAssets: AssetQuantityInput[];
}