import { Model, Types } from 'mongoose';
import { EquipmentItemDocument } from 'src/models/equipment-item.model';
import { LootItemDocument } from 'src/models/loot-item.model';
import { PrizeCatalogItem } from 'src/quests/generation/generated-prizes';

interface LeanEquipment {
    _id: Types.ObjectId;
    rarity?: string | null;
    equipType?: string | null;
    damages?: unknown;
}

interface LeanLoot {
    _id: Types.ObjectId;
    rarity?: string | null;
    effect?: string | null;
    power?: number | null;
}

// catalogo letto lean per premi e consigliati: rarità ed effetto curati a mano a DB
export async function readPrizeCatalog(
    equipmentModel: Model<EquipmentItemDocument>,
    lootModel: Model<LootItemDocument>,
): Promise<PrizeCatalogItem[]> {
    const equipment = await equipmentModel
        .find({})
        .select('_id rarity equipType damages')
        .sort({ _id: 1 })
        .lean<LeanEquipment[]>();
    const loot = await lootModel
        .find({})
        .select('_id rarity effect power')
        .sort({ _id: 1 })
        .lean<LeanLoot[]>();
    return [
        ...equipment.map(
            (item): PrizeCatalogItem => ({
                itemType: 'EquipmentItem',
                id: item._id.toHexString(),
                rarity: item.rarity ?? null,
                equipType: item.equipType ?? null,
                damages: item.damages,
            }),
        ),
        ...loot.map(
            (item): PrizeCatalogItem => ({
                itemType: 'LootItem',
                id: item._id.toHexString(),
                rarity: item.rarity ?? null,
                effect: item.effect ?? null,
                power: item.power ?? null,
            }),
        ),
    ];
}
