import { Model, Types } from 'mongoose';
import { SELLABLE_PET_IDS } from 'src/shops/shop-pool.constants';
import { persistCity } from '../fixtures/city.fixture';
import {
    persistEquipmentItem,
    persistLootItem,
} from '../fixtures/catalog-item.fixture';
import { persistPet } from '../fixtures/pet.fixture';

export interface ShopWorldModels {
    city: Model<any>;
    equipment: Model<any>;
    loot: Model<any>;
    pet: Model<any>;
}

// villaggio, città di mare, capitale, Necrorian e le città dei piazzamenti dei pet (D-04, D-10)
export const SHOP_WORLD_CITIES = [
    { name: 'Fineglen', type: 'valanVillage' },
    { name: 'Valantar', type: 'valanCapital' },
    { name: 'Shadmus', type: 'desertVillage' },
    { name: 'Croce Marina', type: 'tropicalVillage' },
    { name: 'Bellport', type: 'flameNorthCapital' },
    { name: 'Talmvere', type: 'talmvereVillage' },
    { name: 'Cliffbreak', type: 'drusteaCapital' },
    { name: 'Necrorian', type: 'necrorianCity' },
    { name: 'Porto Saldo', type: 'drusteaSeaCity' },
] as const;

const EQUIPMENT_BY_RARITY = [
    ['common', 12],
    ['uncommon', 10],
    ['rare', 6],
    ['ultrarare', 3],
    ['legendary', 2],
] as const;

const LOOT_BY_RARITY = [
    ['common', { hunger: 3, heal: 2, none: 7 }],
    ['uncommon', { hunger: 1, heal: 1, none: 7 }],
    ['rare', { none: 6 }],
    ['ultrarare', { none: 3 }],
    ['legendary', { none: 1 }],
] as const;

const SHOP_PETS = [
    { name: 'Cavallo leggero', speedModifier: 2.5 },
    { name: 'Cammello del Mar Sabbioso', speedModifier: 2 },
    { name: 'Tartaruga gigante delle isole', speedModifier: 1.2 },
    { name: 'Cavallo da viaggio', speedModifier: 2 },
];

const QUEST_ONLY_PETS = ['Pegaso', 'Grifone'];

const ordinal = (index: number) => String(index + 1).padStart(2, '0');

async function persistShopEquipment(model: Model<any>) {
    const items: any[] = [];
    for (const [rarity, count] of EQUIPMENT_BY_RARITY)
        for (let index = 0; index < count; index++)
            items.push(
                await persistEquipmentItem(model, {
                    name: `Equip ${rarity} ${ordinal(index)}`,
                    rarity,
                }),
            );
    items.push(
        await persistEquipmentItem(model, {
            name: 'Equip vietato',
            rarity: 'common',
            sellable: false,
        }),
    );
    items.push(
        await persistEquipmentItem(model, {
            name: 'Equip senza prezzo',
            rarity: 'common',
            buyPrice: null,
        }),
    );
    return items;
}

async function persistShopLoot(model: Model<any>) {
    const items: any[] = [];
    for (const [rarity, effects] of LOOT_BY_RARITY)
        for (const [effect, count] of Object.entries(effects))
            for (let index = 0; index < count; index++)
                items.push(
                    await persistLootItem(model, {
                        name: `Loot ${rarity} ${effect} ${ordinal(index)}`,
                        rarity,
                        effect,
                    }),
                );
    return items;
}

async function persistShopPets(model: Model<any>) {
    const pets: any[] = [];
    for (const [index, pet] of SHOP_PETS.entries())
        pets.push(
            await persistPet(model, {
                ...pet,
                _id: new Types.ObjectId(SELLABLE_PET_IDS[index]),
                sellable: true,
            }),
        );
    for (const name of QUEST_ONLY_PETS)
        pets.push(await persistPet(model, { name, sellable: false }));
    return pets;
}

// abbastanza candidati per riempire anche una capitale, più i casi esclusi dal veto (D-05, D-08, D-09)
export async function persistShopCatalogue(models: ShopWorldModels) {
    return {
        equipment: await persistShopEquipment(models.equipment),
        loot: await persistShopLoot(models.loot),
        pets: await persistShopPets(models.pet),
    };
}

// nessun campo del pool: la semina le vede tutte assenti (D-22)
export async function persistShopCities(
    model: Model<any>,
): Promise<Record<string, any>> {
    const cities: Record<string, any> = {};
    for (const { name, type } of SHOP_WORLD_CITIES)
        cities[name] = await persistCity(model, { name, type });
    return cities;
}
