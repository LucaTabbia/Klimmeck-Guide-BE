import { ObjectId } from 'mongodb';
import type { Document } from 'mongodb';
import { isObjectIdHex } from 'src/mongo/document-id';

// _id resta fuori dal set: va solo nel filtro dell'upsert (RESEARCH §Pattern 3, regola 3)
export interface MappedDocument {
    _id: ObjectId;
    set: Document;
    setOnInsert: Document | null;
}

// D-23: una lore di città aggiorna soltanto City.relatedLore, mai i campi geografici
export interface CityLoreUpdate {
    cityId: ObjectId;
    relatedLore: ObjectId;
}

// ObjectId del driver nativo usato dal CLI: una stringa salvata al posto del ref lascerebbe un residuo Mixed
export function toObjectId(hex: string): ObjectId {
    if (!isObjectIdHex(hex)) {
        throw new RangeError(`Id non valido: ${hex}`);
    }
    return new ObjectId(hex);
}

export const toObjectIds = (hexes: readonly string[] = []): ObjectId[] =>
    hexes.map(toObjectId);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function childPath(path: string, key: string | number): string {
    return path === '' ? `${key}` : `${path}.${key}`;
}

// il driver serializza undefined come null: il server lo conta come modifica a ogni corsa (probe del RESEARCH)
export function assertNoUndefined(value: unknown, path: string = ''): void {
    if (value === undefined) {
        throw new TypeError(`Valore undefined in ${path || '(radice)'}`);
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            assertNoUndefined(item, childPath(path, index)),
        );
        return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
        assertNoUndefined(child, childPath(path, key));
    }
}
