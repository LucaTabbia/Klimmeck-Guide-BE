import { Types } from 'mongoose';
import { citySizeOf } from 'src/cities/city-size';
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { refIdOf } from 'src/mongo/document-id';
import { NO_SHOP_CITY_TYPES } from './shop-pool.constants';
import { allowedRaritiesOf, isShelfEligible } from './shop-pool.rules';

export interface ReportedItem {
    id: string;
    name: string | null;
    rarity: string | null;
}

export interface ShopPoolViolation {
    cityId: string;
    cityName: string;
    size: CitySize;
    emptyPool: boolean;
    outOfSize: ReportedItem[];
    vetoed: ReportedItem[];
    missing: string[];
}

export interface CatalogueEntry {
    _id: Types.ObjectId;
    name?: string | null;
    rarity?: string | null;
    sellable?: boolean | null;
}

// chiave = esadecimale dell'_id
export interface ShopCatalogue {
    equipment: ReadonlyMap<string, CatalogueEntry>;
    loot: ReadonlyMap<string, CatalogueEntry>;
    pets: ReadonlyMap<string, CatalogueEntry>;
}

export interface ReportedCity {
    _id: Types.ObjectId;
    name?: string | null;
    type: CityType;
    shopEquipment?: readonly unknown[] | null;
    shopLoot?: readonly unknown[] | null;
    shopPets?: readonly unknown[] | null;
}

interface PoolList {
    ids: readonly unknown[];
    catalogue: ReadonlyMap<string, CatalogueEntry>;
    checksSize: boolean;
}

// tre liste presenti, anche vuote: il report giudica solo le città con un pool a DB (D-06)
export function hasPool(city: ReportedCity): boolean {
    return [city.shopEquipment, city.shopLoot, city.shopPets].every(
        (list) => list !== undefined,
    );
}

// sola lettura: la mano vince (D-05), il report segnala e non corregge (D-06)
export function violationsOf(
    city: ReportedCity,
    catalogue: ShopCatalogue,
): ShopPoolViolation {
    const size = citySizeOf(city.type);
    const allowed: readonly string[] = allowedRaritiesOf(size);
    const violation: ShopPoolViolation = {
        cityId: city._id.toHexString(),
        cityName: city.name ?? city._id.toHexString(),
        size,
        emptyPool: false,
        outOfSize: [],
        vetoed: [],
        missing: [],
    };
    const lists: PoolList[] = [
        {
            ids: city.shopEquipment ?? [],
            catalogue: catalogue.equipment,
            checksSize: true,
        },
        {
            ids: city.shopLoot ?? [],
            catalogue: catalogue.loot,
            checksSize: true,
        },
        {
            ids: city.shopPets ?? [],
            catalogue: catalogue.pets,
            checksSize: false,
        },
    ];
    for (const list of lists) classifyList(list, allowed, violation);
    violation.emptyPool =
        lists.every(({ ids }) => ids.length === 0) &&
        !NO_SHOP_CITY_TYPES.includes(city.type);
    return violation;
}

function classifyList(
    list: PoolList,
    allowed: readonly string[],
    violation: ShopPoolViolation,
): void {
    for (const [index, raw] of list.ids.entries()) {
        const id = refIdOf(raw);
        const item = id ? list.catalogue.get(id.toHexString()) : undefined;
        if (!id || !item) {
            violation.missing.push(
                id ? id.toHexString() : invalidEntryOf(index),
            );
            continue;
        }
        if (!isShelfEligible(item)) {
            violation.vetoed.push(reportedItemOf(item));
            continue;
        }
        if (list.checksSize && !allowed.includes(item.rarity ?? ''))
            violation.outOfSize.push(reportedItemOf(item));
    }
}

// una voce che non è un id si indica per posizione nella lista: mai il suo contenuto nel report (T-12-13)
const invalidEntryOf = (index: number) => `invalid@${index}`;

function reportedItemOf(item: CatalogueEntry): ReportedItem {
    return {
        id: item._id.toHexString(),
        name: item.name ?? null,
        rarity: item.rarity ?? null,
    };
}

export function hasViolations(violation: ShopPoolViolation): boolean {
    return (
        violation.emptyPool ||
        violation.outOfSize.length > 0 ||
        violation.vetoed.length > 0 ||
        violation.missing.length > 0
    );
}

// solo id, nomi e conteggi (T-12-13)
export function describeViolation(violation: ShopPoolViolation): string {
    const counts = `${violation.outOfSize.length} fuori taglia, ${violation.vetoed.length} vietati, ${violation.missing.length} mancanti`;
    const empty = violation.emptyPool ? ', pool vuoto' : '';
    return `Negozio di ${violation.cityName} (${violation.cityId}, ${violation.size}): ${counts}${empty}`;
}
