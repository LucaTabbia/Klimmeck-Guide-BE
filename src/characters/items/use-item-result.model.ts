import { Field, Int, ObjectType } from '@nestjs/graphql';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { Lore } from 'src/models/lore.model';

// esito di una bevuta dal Diario (Phase 18 D-17): loreUnlocked porta le sole novità (D-19)
@ObjectType()
export class UseItemResult {
    @Field(() => Int)
    hpBefore: number;

    @Field(() => Int)
    hpAfter: number;

    @Field(() => [InjuryType])
    injuriesHealed: InjuryType[];

    @Field(() => Int)
    quantityLeft: number;

    @Field(() => Date)
    recoveryUntil: Date;

    @Field(() => [Lore])
    loreUnlocked: Lore[];
}
