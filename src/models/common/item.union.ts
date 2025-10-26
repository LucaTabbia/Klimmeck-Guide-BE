import { createUnionType } from '@nestjs/graphql';
import { EquipmentItem } from '../equipment-item.model';
import { LootItem } from '../loot-item.model';

export const ItemUnion = createUnionType({
    name: 'ItemUnion',
    types: () => [EquipmentItem, LootItem],
    resolveType: (value) => {
        if (value.equipType) {
            return EquipmentItem;
        }
        return LootItem;
    },
});