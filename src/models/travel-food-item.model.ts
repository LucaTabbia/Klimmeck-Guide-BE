import { Field, Int, ObjectType } from '@nestjs/graphql';
import { LootItem } from './loot-item.model';

// cibo che la partenza mangerebbe (Phase 14 D-09): item popolato per il nome, ordine dell'inventario (D-17)
@ObjectType()
export class TravelFoodItem {
    @Field(() => LootItem)
    item: LootItem;

    @Field(() => Int)
    quantity: number;
}
