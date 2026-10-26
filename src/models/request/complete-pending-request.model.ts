import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { InjuryType } from 'src/models/enums/injury-type.enum';

// il GM racconta il combattimento della live (D-04): solo HP, ferite, consumi e magie; premi e XP restano del catalogo
@InputType()
export class ItemUsageInput {
    @Field(() => ID)
    item: string;

    @Field(() => Int)
    quantity: number;
}

@InputType()
export class SpellUsageInput {
    @Field(() => ID)
    spell: string;

    @Field(() => Int)
    usages: number;
}

@InputType()
export class ParticipantOverrideInput {
    @Field(() => ID)
    characterId: string;

    @Field(() => Int, { nullable: true })
    hpAfter?: number | null;

    @Field(() => [InjuryType], { nullable: true })
    injuries?: InjuryType[] | null;

    @Field(() => [ItemUsageInput], { nullable: true })
    consumablesUsed?: ItemUsageInput[] | null;

    @Field(() => [SpellUsageInput], { nullable: true })
    spellsUsed?: SpellUsageInput[] | null;
}

@InputType()
export class CompletePendingRequestInput {
    @Field(() => ID)
    pendingQuestId: string;

    @Field(() => [ParticipantOverrideInput], { nullable: true })
    outcomes?: ParticipantOverrideInput[] | null;
}
