import { Db, ObjectId } from 'mongodb';
import type {
    FixKind,
    NormalizePoiTypesFix,
    RenameCityFix,
    UnsetLoreUnlockedFix,
} from 'src/content/schema/fix.content';
import { sameBson } from 'src/content/sync/bson-diff';
import { PoiType } from 'src/models/enums/poi-type.enum';
import { changeStatus, FixMode, FixReport } from './fix-report';

const POI_TYPES: readonly string[] = Object.values(PoiType);

export function normalizedPoiTypes(
    types: readonly string[],
    replacements: Readonly<Record<string, string>>,
): string[] {
    const repaired = types.map((type) =>
        Object.hasOwn(replacements, type) ? replacements[type] : type,
    );
    return [...new Set(repaired)];
}

export function unknownPoiTypes(types: readonly string[]): string[] {
    return types.filter((type) => !POI_TYPES.includes(type));
}

// i POI legacy possono avere il tipo scalare: lo si tratta come lista di un elemento
function storedTypesOf(type: unknown): string[] {
    if (Array.isArray(type)) return type.map(typeNameOf);
    return type == null ? [] : [typeNameOf(type)];
}

// un valore non stringa non è mai un PoiType: resta leggibile nel report come unknownTypes
function typeNameOf(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
}

function blocked(
    fix: { key: string; kind: FixKind },
    extra: Partial<FixReport> = {},
): FixReport {
    return {
        key: fix.key,
        kind: fix.kind,
        status: 'blocked',
        touched: 0,
        ...extra,
    };
}

export async function normalizePoiTypes(
    db: Db,
    fix: NormalizePoiTypesFix,
    mode: FixMode,
): Promise<FixReport> {
    const _id = new ObjectId(fix.target);
    const pois = db.collection('pointsofinterest');
    const poi = await pois.findOne({ _id });
    if (!poi) return blocked(fix);
    const types = normalizedPoiTypes(storedTypesOf(poi.type), fix.replacements);
    const unknownTypes = unknownPoiTypes(types);
    if (unknownTypes.length > 0) return blocked(fix, { unknownTypes });
    const touched = sameBson(poi.type, types) ? 0 : 1;
    if (touched > 0 && mode === 'apply') {
        await pois.updateOne({ _id }, { $set: { type: types } });
    }
    return {
        key: fix.key,
        kind: fix.kind,
        status: changeStatus(touched, mode),
        touched,
    };
}

// scrive solo se il nome è ancora quello atteso (T-11-24): un altro nome blocca e viene riportato
export async function renameCity(
    db: Db,
    fix: RenameCityFix,
    mode: FixMode,
): Promise<FixReport> {
    const _id = new ObjectId(fix.target);
    const cities = db.collection('cities');
    const city = await cities.findOne({ _id });
    if (!city) return blocked(fix);
    if (city.name === fix.to) {
        return { key: fix.key, kind: fix.kind, status: 'done', touched: 0 };
    }
    if (city.name !== fix.from) {
        return blocked(fix, { foundName: String(city.name) });
    }
    if (mode === 'apply') {
        await cities.updateOne(
            { _id, name: fix.from },
            { $set: { name: fix.to } },
        );
    }
    return {
        key: fix.key,
        kind: fix.kind,
        status: changeStatus(1, mode),
        touched: 1,
    };
}

// residuo del campo Lore.unlocked rimosso dal modello (D-25)
export async function unsetLoreUnlocked(
    db: Db,
    fix: UnsetLoreUnlockedFix,
    mode: FixMode,
): Promise<FixReport> {
    const lore = db.collection('lore');
    const withFlag = { unlocked: { $exists: true } };
    let touched = await lore.countDocuments(withFlag);
    if (touched > 0 && mode === 'apply') {
        const result = await lore.updateMany(withFlag, {
            $unset: { unlocked: '' },
        });
        touched = result.modifiedCount;
    }
    return {
        key: fix.key,
        kind: fix.kind,
        status: changeStatus(touched, mode),
        touched,
    };
}
