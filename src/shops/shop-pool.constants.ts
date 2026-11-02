// costanti della semina dei negozi: guidano solo la semina, ciò che sta a DB vince (D-05)
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';

export const SHOP_SEED_VERSION = 'v1';

export interface ShopPoolQuota {
    readonly equipment: number;
    readonly loot: number;
}

export const SHOP_POOL_SIZES = {
    village: { equipment: 10, loot: 12 },
    city: { equipment: 16, loot: 18 },
    capital: { equipment: 24, loot: 24 },
} as const satisfies Record<CitySize, ShopPoolQuota>;

// punti percentuali interi, dal più comune: le quote si calcolano senza virgola mobile (D-08)
export interface TierWeight {
    readonly rarity: RarityType;
    readonly percent: number;
}

export const SHOP_RARITY_WEIGHTS = {
    village: [
        { rarity: RarityType.common, percent: 75 },
        { rarity: RarityType.uncommon, percent: 25 },
    ],
    city: [
        { rarity: RarityType.common, percent: 50 },
        { rarity: RarityType.uncommon, percent: 35 },
        { rarity: RarityType.rare, percent: 15 },
    ],
    capital: [
        { rarity: RarityType.common, percent: 35 },
        { rarity: RarityType.uncommon, percent: 35 },
        { rarity: RarityType.rare, percent: 20 },
        { rarity: RarityType.ultrarare, percent: 10 },
    ],
} as const satisfies Record<CitySize, readonly TierWeight[]>;

export interface LootGuarantee {
    readonly effect: EffectType;
    readonly count: number;
}

export const SHOP_LOOT_GUARANTEES: readonly LootGuarantee[] = [
    { effect: EffectType.hunger, count: 2 },
    { effect: EffectType.heal, count: 1 },
];

export interface PetPlacementCity {
    readonly name: string;
    readonly type: CityType;
}

export interface PetPlacement {
    readonly petId: string;
    readonly name: string;
    readonly cities: readonly PetPlacementCity[];
}

// città per nome + CityType: solo 4 dei 7 id sono documentati (D-24, A5)
export const SELLABLE_PET_PLACEMENTS: readonly PetPlacement[] = [
    {
        petId: '6ae8070540e5e6676b7d6f8d',
        name: 'Cavallo leggero',
        cities: [
            { name: 'Fineglen', type: CityType.valanVillage },
            { name: 'Valantar', type: CityType.valanCapital },
        ],
    },
    {
        petId: '6ae8070540e5e6676b7d6f90',
        name: 'Cammello del Mar Sabbioso',
        cities: [
            { name: 'Shadmus', type: CityType.desertVillage },
            { name: 'Valantar', type: CityType.valanCapital },
        ],
    },
    {
        petId: '6ae8070540e5e6676b7d6f94',
        name: 'Tartaruga gigante delle isole',
        cities: [
            { name: 'Croce Marina', type: CityType.tropicalVillage },
            { name: 'Bellport', type: CityType.flameNorthCapital },
        ],
    },
    {
        petId: '6adfa18e6c2f93eb0b76d34a',
        name: 'Cavallo da viaggio',
        cities: [
            { name: 'Talmvere', type: CityType.talmvereVillage },
            { name: 'Cliffbreak', type: CityType.drusteaCapital },
        ],
    },
];

export const SELLABLE_PET_IDS: readonly string[] = SELLABLE_PET_PLACEMENTS.map(
    ({ petId }) => petId,
);

// Necrorian ha solo la dungeon (Phase 11 D-17): pool vuoto esplicito (D-04)
export const NO_SHOP_CITY_TYPES: readonly CityType[] = [CityType.necrorianCity];

export const SHOP_REPORT_WARNINGS_LIMIT = 50;
