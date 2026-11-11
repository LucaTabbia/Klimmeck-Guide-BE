import { Types } from 'mongoose';
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    CatalogueEntry,
    describeViolation,
    hasPool,
    hasViolations,
    ReportedCity,
    ShopCatalogue,
    violationsOf,
} from './shop-pool.report';

function entry(
    name: string,
    rarity?: RarityType | null,
    sellable?: boolean | null,
): CatalogueEntry {
    return { _id: new Types.ObjectId(), name, rarity, sellable };
}

function catalogueOf(
    equipment: CatalogueEntry[],
    loot: CatalogueEntry[] = [],
    pets: CatalogueEntry[] = [],
): ShopCatalogue {
    const byHex = (entries: CatalogueEntry[]) =>
        new Map(entries.map((item) => [item._id.toHexString(), item]));
    return {
        equipment: byHex(equipment),
        loot: byHex(loot),
        pets: byHex(pets),
    };
}

type ReportedPool = NonNullable<ReportedCity['shop']>;

function village(
    pool: ReportedPool = {},
    overrides: Partial<ReportedCity> = {},
): ReportedCity {
    return {
        _id: new Types.ObjectId(),
        name: 'Fineglen',
        type: CityType.valanVillage,
        shop: { equipment: [], loot: [], pets: [], ...pool },
        ...overrides,
    };
}

describe('shop pool report', () => {
    const common = entry('Spada comune', RarityType.common);
    const potion = entry('Pozione', RarityType.uncommon);
    const horse = entry('Cavallo leggero', null, true);

    it('reports nothing for a pool within the rules (D-06)', () => {
        const city = village({
            equipment: [common._id],
            loot: [potion._id],
            pets: [horse._id],
        });

        const violation = violationsOf(
            city,
            catalogueOf([common], [potion], [horse]),
        );

        expect(hasViolations(violation)).toBe(false);
        expect(violation).toEqual({
            cityId: city._id.toHexString(),
            cityName: 'Fineglen',
            size: CitySize.village,
            emptyPool: false,
            outOfSize: [],
            vetoed: [],
            missing: [],
        });
    });

    it('reports an ultrarare item in a village as out of size without removing it (D-05, D-06)', () => {
        const ultrarare = entry('Lama rara', RarityType.ultrarare);
        const city = village({ equipment: [common._id, ultrarare._id] });

        const violation = violationsOf(city, catalogueOf([common, ultrarare]));

        expect(violation.outOfSize).toEqual([
            {
                id: ultrarare._id.toHexString(),
                name: 'Lama rara',
                rarity: RarityType.ultrarare,
            },
        ]);
        expect(city.shop?.equipment).toEqual([common._id, ultrarare._id]);
        expect(hasViolations(violation)).toBe(true);
    });

    it('reports an item without rarity as out of size (D-06)', () => {
        const bare = entry('Senza rarità');
        const city = village({ loot: [bare._id] });

        const violation = violationsOf(city, catalogueOf([], [bare]));

        expect(violation.outOfSize).toEqual([
            { id: bare._id.toHexString(), name: 'Senza rarità', rarity: null },
        ]);
    });

    it('reports a legendary, a sellable false item and a quest-only pet as vetoed (D-05, D-06)', () => {
        const legendary = entry('Spada leggendaria', RarityType.legendary);
        const forbidden = entry('Pozione vietata', RarityType.common, false);
        const pegasus = entry('Pegaso', null, false);
        const capital = village(
            {
                equipment: [legendary._id],
                loot: [forbidden._id],
                pets: [pegasus._id],
            },
            { name: 'Valantar', type: CityType.valanCapital },
        );

        const violation = violationsOf(
            capital,
            catalogueOf([legendary], [forbidden], [pegasus]),
        );

        expect(violation.vetoed).toEqual([
            {
                id: legendary._id.toHexString(),
                name: 'Spada leggendaria',
                rarity: RarityType.legendary,
            },
            {
                id: forbidden._id.toHexString(),
                name: 'Pozione vietata',
                rarity: RarityType.common,
            },
            { id: pegasus._id.toHexString(), name: 'Pegaso', rarity: null },
        ]);
        expect(violation.outOfSize).toEqual([]);
    });

    it('reports the ids missing from the catalogue, malformed ones included (D-06)', () => {
        const gone = new Types.ObjectId();
        const city = village({
            equipment: [gone],
            pets: ['not-an-id'],
        });

        const violation = violationsOf(city, catalogueOf([]));

        expect(violation.missing).toEqual([gone.toHexString(), 'invalid@0']);
    });

    it('marks an unreadable pool entry by its position without printing it (D-06)', () => {
        const gone = new Types.ObjectId();
        const city = village({ loot: [gone, {}, null] });

        const violation = violationsOf(city, catalogueOf([]));

        expect(violation.missing).toEqual([
            gone.toHexString(),
            'invalid@1',
            'invalid@2',
        ]);
    });

    it('classifies each item once, missing before vetoed before out of size (D-06)', () => {
        const legendary = entry('Spada leggendaria', RarityType.legendary);
        const city = village({ equipment: [legendary._id] });

        const violation = violationsOf(city, catalogueOf([legendary]));

        expect(violation.vetoed.map(({ id }) => id)).toEqual([
            legendary._id.toHexString(),
        ]);
        expect(violation.outOfSize).toEqual([]);
        expect(violation.missing).toEqual([]);
    });

    it('reports an empty pool (D-06)', () => {
        const violation = violationsOf(village(), catalogueOf([]));

        expect(violation.emptyPool).toBe(true);
        expect(hasViolations(violation)).toBe(true);
    });

    it('never reports the empty pool of Necrorian (D-04, D-06)', () => {
        const necrorian = village(
            {},
            { name: 'Necrorian', type: CityType.necrorianCity },
        );

        const violation = violationsOf(necrorian, catalogueOf([]));

        expect(violation.emptyPool).toBe(false);
        expect(hasViolations(violation)).toBe(false);
    });

    it('reads ids curated as hex strings (D-06)', () => {
        const city = village({
            equipment: [common._id.toHexString()],
            pets: [horse._id.toHexString()],
        });

        const violation = violationsOf(
            city,
            catalogueOf([common], [], [horse]),
        );

        expect(hasViolations(violation)).toBe(false);
    });

    it('describes a violation with ids, names and counts only (D-06)', () => {
        const ultrarare = entry('Lama rara', RarityType.ultrarare);
        const city = village({ equipment: [ultrarare._id] });
        const empty = village();

        expect(
            describeViolation(violationsOf(city, catalogueOf([ultrarare]))),
        ).toEqual(
            `Negozio di Fineglen (${city._id.toHexString()}, village): 1 fuori taglia, 0 vietati, 0 mancanti`,
        );
        expect(describeViolation(violationsOf(empty, catalogueOf([])))).toEqual(
            `Negozio di Fineglen (${empty._id.toHexString()}, village): 0 fuori taglia, 0 vietati, 0 mancanti, pool vuoto`,
        );
    });

    it('judges only a city whose three pool lists are present, even empty (D-10)', () => {
        const withoutShop = village({}, { shop: undefined });
        const withTwoLists = village({}, { shop: { equipment: [], loot: [] } });
        const withThreeEmptyLists = village();

        expect(
            [withoutShop, withTwoLists, withThreeEmptyLists].map(hasPool),
        ).toEqual([false, false, true]);
    });
});
