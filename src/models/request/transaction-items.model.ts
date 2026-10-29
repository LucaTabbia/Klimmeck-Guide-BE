import { InputType, Field } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { AssetQuantityInput } from '../common/asset-quantity.model';

export const MAX_TRANSACTION_LINES = 100;

@InputType()
export class TransactionItems {
    @Field(() => [AssetQuantityInput])
    @IsArray()
    @ArrayMaxSize(MAX_TRANSACTION_LINES)
    @ValidateNested({ each: true })
    @Type(() => AssetQuantityInput)
    lootAssets: AssetQuantityInput[];

    @Field(() => [AssetQuantityInput])
    @IsArray()
    @ArrayMaxSize(MAX_TRANSACTION_LINES)
    @ValidateNested({ each: true })
    @Type(() => AssetQuantityInput)
    equipAssets: AssetQuantityInput[];
}
