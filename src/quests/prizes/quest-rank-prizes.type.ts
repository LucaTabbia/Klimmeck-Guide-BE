import { Field, ObjectType } from '@nestjs/graphql';
import { QuestPrizes } from 'src/models/quest/quest-prizes.model';
import type { PrizesSnapshot } from '../outcomes/rewards/quest-rewards';

// un blocco premio per titolo sul filo (D-22): gemello di QuestRankPrize (src/models/quest/quest-rank-prize.model.ts), che resta solo a DB;
// il contenuto è il blocco stesso servito come QuestPrizes, nessun tipo nuovo per i campi del premio
@ObjectType()
export class QuestRankPrizes {
    @Field(() => String)
    title: string;

    @Field(() => QuestPrizes)
    prizes: PrizesSnapshot;
}
