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
    // gli id di SELLABLE_PET_IDS, non inventati: la semina piazza i compagni per id (D-10, D-24); solo id, nessun altro dato reale
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

export interface ShopCatalogueFixture {
    equipment: any[];
    loot: any[];
    pets: any[];
}

const byName = (items: any[], name: string): Types.ObjectId =>
    items.find((item) => item.name === name)._id as Types.ObjectId;

type PoolNames = Record<
    'shopEquipment' | 'shopLoot' | 'shopPets',
    readonly string[]
>;

// pool curati a mano come farebbe l'utente a DB (D-05), dentro le fasce di taglia (D-08): liste diverse per il villaggio, la città di mare e la capitale, il Cavallo da viaggio solo a Talmvere, Necrorian vuota (D-04, D-10); le altre città restano senza pool (D-22)
const CURATED_POOLS: Record<string, PoolNames> = {
    Fineglen: {
        shopEquipment: [
            'Equip common 01',
            'Equip common 02',
            'Equip common 03',
            'Equip uncommon 01',
        ],
        shopLoot: [
            'Loot common hunger 01',
            'Loot common hunger 02',
            'Loot common heal 01',
            'Loot common none 01',
        ],
        shopPets: [],
    },
    'Porto Saldo': {
        shopEquipment: [
            'Equip common 04',
            'Equip uncommon 02',
            'Equip uncommon 03',
            'Equip rare 01',
        ],
        shopLoot: [
            'Loot common hunger 03',
            'Loot uncommon hunger 01',
            'Loot uncommon heal 01',
            'Loot rare none 01',
        ],
        shopPets: [],
    },
    Valantar: {
        shopEquipment: [
            'Equip common 05',
            'Equip uncommon 04',
            'Equip rare 02',
            'Equip rare 03',
            'Equip ultrarare 01',
        ],
        shopLoot: [
            'Loot common hunger 01',
            'Loot common hunger 02',
            'Loot common heal 02',
            'Loot ultrarare none 01',
        ],
        shopPets: ['Cavallo leggero', 'Cammello del Mar Sabbioso'],
    },
    Talmvere: {
        shopEquipment: ['Equip common 06', 'Equip common 07'],
        shopLoot: [
            'Loot common hunger 01',
            'Loot common hunger 02',
            'Loot common heal 01',
        ],
        shopPets: ['Cavallo da viaggio'],
    },
    Necrorian: { shopEquipment: [], shopLoot: [], shopPets: [] },
};

export async function persistShopPools(
    model: Model<any>,
    cities: Record<string, any>,
    catalogue: ShopCatalogueFixture,
): Promise<void> {
    const sources: Record<keyof PoolNames, any[]> = {
        shopEquipment: catalogue.equipment,
        shopLoot: catalogue.loot,
        shopPets: catalogue.pets,
    };
    for (const [cityName, pool] of Object.entries(CURATED_POOLS)) {
        const lists = Object.fromEntries(
            (Object.keys(pool) as (keyof PoolNames)[]).map((field) => [
                field,
                pool[field].map((name) => byName(sources[field], name)),
            ]),
        );
        await model.collection.updateOne({ _id: cities[cityName]._id }, {
            $set: lists,
        } as never);
    }
}
