import { Types } from 'mongoose';
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { SHOP_POOL_SIZES, SHOP_RARITY_WEIGHTS } from './shop-pool.constants';
import { drawEquipment, drawLoot, petsFor, tierQuotas } from './shop-pool.draw';
import { SeedCandidate } from './shop-pool.rules';

const idAt = (n: number): Types.ObjectId =>
    new Types.ObjectId(n.toString(16).padStart(24, '0'));

const PRICE = { gold: 0, silver: 1, copper: 0 };
const VILLAGE_ID = idAt(1000);
const OTHER_VILLAGE_ID = idAt(1001);

let nextId = 1;
const candidate = (
    rarity: RarityType | undefined,
    overrides: Partial<SeedCandidate> = {},
): SeedCandidate => ({
    _id: idAt(nextId++),
    rarity,
    sellable: undefined,
    buyPrice: PRICE,
    effect: EffectType.none,
    ...overrides,
});

const many = (
    count: number,
    rarity: RarityType,
    overrides: Partial<SeedCandidate> = {},
): SeedCandidate[] =>
    Array.from({ length: count }, () => candidate(rarity, overrides));

const quotasOf = (map: Map<RarityType, number>) => Object.fromEntries(map);

const rarityCounts = (
    ids: readonly Types.ObjectId[],
    catalogue: readonly SeedCandidate[],
): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const id of ids) {
        const item = catalogue.find((entry) => entry._id.equals(id));
        const rarity = item?.rarity ?? 'missing';
        counts[rarity] = (counts[rarity] ?? 0) + 1;
    }
    return counts;
};

const effectCount = (
    ids: readonly Types.ObjectId[],
    catalogue: readonly SeedCandidate[],
    effect: EffectType,
): number =>
    ids.filter(
        (id) =>
            catalogue.find((entry) => entry._id.equals(id))?.effect === effect,
    ).length;

const hexes = (ids: readonly Types.ObjectId[]) =>
    ids.map((id) => id.toHexString());

const equipmentCatalogue = (): SeedCandidate[] => [
    ...many(12, RarityType.common),
    ...many(10, RarityType.uncommon),
    ...many(6, RarityType.rare),
    ...many(3, RarityType.ultrarare),
    ...many(2, RarityType.legendary),
    candidate(RarityType.common, { sellable: false }),
    candidate(RarityType.common, { buyPrice: undefined }),
];

const lootCatalogue = (): SeedCandidate[] => [
    ...many(3, RarityType.common, { effect: EffectType.hunger }),
    ...many(2, RarityType.common, { effect: EffectType.heal }),
    ...many(10, RarityType.common),
    ...many(10, RarityType.uncommon),
    ...many(6, RarityType.rare),
    ...many(3, RarityType.ultrarare),
];

describe('tierQuotas', () => {
    it('splits every quota by the largest remainder (D-08)', () => {
        const quotas = (size: CitySize, list: 'equipment' | 'loot') =>
            quotasOf(
                tierQuotas(
                    SHOP_POOL_SIZES[size][list],
                    SHOP_RARITY_WEIGHTS[size],
                ),
            );
        expect({
            villageEquipment: quotas(CitySize.village, 'equipment'),
            villageLoot: quotas(CitySize.village, 'loot'),
            cityEquipment: quotas(CitySize.city, 'equipment'),
            cityLoot: quotas(CitySize.city, 'loot'),
            capitalEquipment: quotas(CitySize.capital, 'equipment'),
            capitalLoot: quotas(CitySize.capital, 'loot'),
        }).toEqual({
            villageEquipment: { common: 8, uncommon: 2 },
            villageLoot: { common: 9, uncommon: 3 },
            cityEquipment: { common: 8, uncommon: 6, rare: 2 },
            cityLoot: { common: 9, uncommon: 6, rare: 3 },
            capitalEquipment: { common: 9, uncommon: 8, rare: 5, ultrarare: 2 },
            capitalLoot: { common: 9, uncommon: 8, rare: 5, ultrarare: 2 },
        });
    });

    it('ties an equal remainder to the lower tier (D-08)', () => {
        const quotas = quotasOf(
            tierQuotas(24, SHOP_RARITY_WEIGHTS[CitySize.capital]),
        );
        expect([quotas.common, quotas.ultrarare]).toEqual([9, 2]);
    });
});

describe('drawEquipment', () => {
    it('draws the village equipment from common and uncommon only (D-08)', () => {
        const catalogue = equipmentCatalogue();
        const village = drawEquipment(VILLAGE_ID, CitySize.village, catalogue);
        const capital = drawEquipment(VILLAGE_ID, CitySize.capital, catalogue);
        expect({
            village: [village.length, rarityCounts(village, catalogue)],
            capital: [capital.length, rarityCounts(capital, catalogue)],
        }).toEqual({
            village: [10, { common: 8, uncommon: 2 }],
            capital: [24, { common: 9, uncommon: 8, rare: 5, ultrarare: 2 }],
        });
    });

    it('never draws a legendary, a sellable false or a priceless item (D-05)', () => {
        const catalogue = equipmentCatalogue();
        const vetoed = catalogue.filter(
            (item) =>
                item.rarity === RarityType.legendary ||
                item.sellable === false ||
                item.buyPrice === undefined,
        );
        const drawn = [CitySize.village, CitySize.city, CitySize.capital]
            .flatMap((size) => drawEquipment(VILLAGE_ID, size, catalogue))
            .map((id) => id.toHexString());
        expect(
            vetoed.filter((item) => drawn.includes(item._id.toHexString())),
        ).toEqual([]);
    });

    it('completes a short tier with the lower tier (D-08)', () => {
        const catalogue = [
            ...many(12, RarityType.common),
            ...many(10, RarityType.uncommon),
            ...many(6, RarityType.rare),
            ...many(1, RarityType.ultrarare),
        ];
        const drawn = drawEquipment(VILLAGE_ID, CitySize.capital, catalogue);
        expect(rarityCounts(drawn, catalogue)).toEqual({
            common: 9,
            uncommon: 8,
            rare: 6,
            ultrarare: 1,
        });
    });

    it('returns a shorter list when the lowest tier runs out (D-08)', () => {
        const catalogue = [
            ...many(3, RarityType.common),
            ...many(1, RarityType.uncommon),
        ];
        expect(
            drawEquipment(VILLAGE_ID, CitySize.village, catalogue),
        ).toHaveLength(4);
    });

    it('replays the same pool for the same city and catalogue (D-24)', () => {
        const catalogue = equipmentCatalogue();
        expect(
            hexes(drawEquipment(VILLAGE_ID, CitySize.capital, catalogue)),
        ).toEqual(
            hexes(drawEquipment(VILLAGE_ID, CitySize.capital, catalogue)),
        );
    });

    it('keeps the pool when the catalogue arrives in another order (D-24)', () => {
        const catalogue = equipmentCatalogue();
        const reversed = [...catalogue].reverse();
        expect(
            hexes(drawEquipment(VILLAGE_ID, CitySize.city, reversed)),
        ).toEqual(hexes(drawEquipment(VILLAGE_ID, CitySize.city, catalogue)));
    });

    it('draws different pools for two cities (D-24)', () => {
        const catalogue = equipmentCatalogue();
        expect(
            hexes(drawEquipment(VILLAGE_ID, CitySize.village, catalogue)),
        ).not.toEqual(
            hexes(drawEquipment(OTHER_VILLAGE_ID, CitySize.village, catalogue)),
        );
    });
});

describe('drawLoot', () => {
    it('puts two hunger and one heal loot inside every quota (D-09)', () => {
        const catalogue = lootCatalogue();
        const summary = [CitySize.village, CitySize.city, CitySize.capital].map(
            (size) => {
                const { ids, missingGuarantees } = drawLoot(
                    VILLAGE_ID,
                    size,
                    catalogue,
                );
                return {
                    length: ids.length,
                    hunger: effectCount(ids, catalogue, EffectType.hunger) >= 2,
                    heal: effectCount(ids, catalogue, EffectType.heal) >= 1,
                    tiers: rarityCounts(ids, catalogue),
                    missingGuarantees,
                };
            },
        );
        expect(summary).toEqual([
            {
                length: 12,
                hunger: true,
                heal: true,
                tiers: { common: 9, uncommon: 3 },
                missingGuarantees: [],
            },
            {
                length: 18,
                hunger: true,
                heal: true,
                tiers: { common: 9, uncommon: 6, rare: 3 },
                missingGuarantees: [],
            },
            {
                length: 24,
                hunger: true,
                heal: true,
                tiers: { common: 9, uncommon: 8, rare: 5, ultrarare: 2 },
                missingGuarantees: [],
            },
        ]);
    });

    it('takes a guarantee from the next tier when the lowest has none (D-09)', () => {
        const hungerUncommon = many(2, RarityType.uncommon, {
            effect: EffectType.hunger,
        });
        const catalogue = [
            ...many(1, RarityType.common, { effect: EffectType.heal }),
            ...many(12, RarityType.common),
            ...many(8, RarityType.uncommon),
            ...hungerUncommon,
        ];
        const { ids, missingGuarantees } = drawLoot(
            VILLAGE_ID,
            CitySize.village,
            catalogue,
        );
        expect({
            hungerUncommon: hungerUncommon.filter((item) =>
                ids.some((id) => id.equals(item._id)),
            ).length,
            tiers: rarityCounts(ids, catalogue),
            missingGuarantees,
        }).toEqual({
            hungerUncommon: 2,
            tiers: { common: 9, uncommon: 3 },
            missingGuarantees: [],
        });
    });

    it('reports a missing guarantee without failing (D-09)', () => {
        const catalogue = [
            ...many(2, RarityType.common, { effect: EffectType.hunger }),
            ...many(12, RarityType.common),
            ...many(5, RarityType.uncommon),
        ];
        const { ids, missingGuarantees } = drawLoot(
            VILLAGE_ID,
            CitySize.village,
            catalogue,
        );
        expect({ length: ids.length, missingGuarantees }).toEqual({
            length: 12,
            missingGuarantees: ['heal'],
        });
    });
});

describe('petsFor', () => {
    const CAVALLO_LEGGERO = new Types.ObjectId('6ae8070540e5e6676b7d6f8d');
    const CAMMELLO = new Types.ObjectId('6ae8070540e5e6676b7d6f90');
    const TARTARUGA = new Types.ObjectId('6ae8070540e5e6676b7d6f94');
    const CAVALLO_DA_VIAGGIO = new Types.ObjectId('6adfa18e6c2f93eb0b76d34a');
    const PRICE = { gold: 0, silver: 1, copper: 0 };
    const pets: SeedCandidate[] = [
        CAVALLO_DA_VIAGGIO,
        TARTARUGA,
        CAMMELLO,
        CAVALLO_LEGGERO,
    ].map((_id) => ({ _id, sellable: true, buyPrice: PRICE }));

    it('places each sellable pet only in its two cities (D-10)', () => {
        const placed = (name: string, type: CityType) =>
            hexes(petsFor({ name, type }, pets));
        expect({
            fineglen: placed('Fineglen', CityType.valanVillage),
            valantar: placed('Valantar', CityType.valanCapital),
            talmvere: placed('Talmvere', CityType.talmvereVillage),
            cliffbreak: placed('Cliffbreak', CityType.drusteaCapital),
            elsewhere: placed('Andogan', CityType.valanCity),
        }).toEqual({
            fineglen: hexes([CAVALLO_LEGGERO]),
            valantar: hexes([CAVALLO_LEGGERO, CAMMELLO]),
            talmvere: hexes([CAVALLO_DA_VIAGGIO]),
            cliffbreak: hexes([CAVALLO_DA_VIAGGIO]),
            elsewhere: [],
        });
    });

    it('matches a placement by name and CityType (D-24)', () => {
        expect(
            petsFor({ name: 'Valantar', type: CityType.valanCity }, pets),
        ).toEqual([]);
    });

    it('skips a placed pet missing from the catalogue or vetoed (D-05, D-10)', () => {
        const catalogue: SeedCandidate[] = [
            { _id: CAVALLO_LEGGERO, sellable: false, buyPrice: PRICE },
            { _id: TARTARUGA, buyPrice: PRICE },
        ];
        expect({
            valantar: petsFor(
                { name: 'Valantar', type: CityType.valanCapital },
                catalogue,
            ),
            bellport: hexes(
                petsFor(
                    { name: 'Bellport', type: CityType.flameNorthCapital },
                    catalogue,
                ),
            ),
        }).toEqual({ valantar: [], bellport: hexes([TARTARUGA]) });
    });

    it('skips a placed pet without a buy price (D-05, D-10)', () => {
        const catalogue: SeedCandidate[] = [
            { _id: CAVALLO_LEGGERO, sellable: true, buyPrice: null },
            { _id: CAMMELLO, sellable: true, buyPrice: PRICE },
        ];
        expect(
            hexes(
                petsFor(
                    { name: 'Valantar', type: CityType.valanCapital },
                    catalogue,
                ),
            ),
        ).toEqual(hexes([CAMMELLO]));
    });
});
