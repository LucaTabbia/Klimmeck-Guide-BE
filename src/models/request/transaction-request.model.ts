import { InputType, Field } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { IsBoolean, ValidateNested } from 'class-validator';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { CoinsInput } from '../common/coins.model';
import { TransactionItems } from './transaction-items.model';

@InputType()
export class TransactionRequest {
    @Field(() => String)
    @IsObjectIdHex()
    id: string;

    @Field(() => TransactionItems)
    @ValidateNested()
    @Type(() => TransactionItems)
    boughtItems: TransactionItems;

    @Field(() => TransactionItems)
    @ValidateNested()
    @Type(() => TransactionItems)
    soldItems: TransactionItems;

    @Field(() => CoinsInput)
    @ValidateNested()
    @Type(() => CoinsInput)
    total: CoinsInput;

    @Field(() => Boolean)
    @IsBoolean()
    isTotalPositive: boolean;
}
