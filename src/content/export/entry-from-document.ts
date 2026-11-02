import { ObjectId } from 'mongodb';

// letto dal driver: ogni campo è da verificare prima dell'uso
export type StoredDocument = Readonly<Record<string, unknown>>;

type EntryObject = Record<string, unknown>;

// inverso dei mapper (D-04): le chiavi seguono l'ordine del README §Formato delle voci
export interface ExportedEntry {
    entry: EntryObject;
    normalized: string[];
    dropped: string[];
}

// tolti senza segnalarli: l'id diventa `id`, la versione è di Mongoose, `unlocked` non esiste più (D-25)
const REMOVED_FIELDS: readonly string[] = ['_id', '__v', 'unlocked'];

const LORE_FIELDS = ['type', 'image', 'name', 'description', 'relatedLore'];
const SPELL_FIELDS = [
    'name',
    'description',
    'useType',
    'energyDamage',
    'requiredLearnTime',
    'minXpToLearn',
    'recoveryTime',
    'maxUsages',
];
const ASSET_FIELDS = [
    'name',
    'itemType',
    'description',
    'sellPrice',
    'buyPrice',
    'rarity',
    'sellable',
];
const EQUIPMENT_FIELDS = [
    ...ASSET_FIELDS,
    'equipType',
    'addedSpell',
    'damages',
];
const LOOT_FIELDS = [...ASSET_FIELDS, 'power', 'effect'];
const ENEMY_FIELDS = [
    'name',
    'locations',
    'energyWeaknesses',
    'baseWeaknesses',
    'relatedLore',
    'xp',
    'spells',
    'lifePoints',
    'imagePath',
    'damages',
];
const PET_FIELDS = [
    'name',
    'damages',
    'buyPrice',
    'sellPrice',
    'xp',
    'maxXp',
    'currentLifePoints',
    'maxLifePoints',
    'imagePath',
    'speedModifier',
];

export function hexOf(value: unknown): unknown {
    return value instanceof ObjectId ? value.toHexString() : value;
}

const hexOrNull = (value: unknown): unknown => hexOf(value) ?? null;

function hexListOf(value: unknown): unknown[] {
    return Array.isArray(value) ? value.map(hexOf) : [];
}

const listOf = (value: unknown): unknown[] =>
    Array.isArray(value) ? [...(value as unknown[])] : [];

function coinsOf(value: unknown): StoredDocument | null {
    if (value === null || value === undefined) return null;
    const coins = value as StoredDocument;
    return {
        gold: coins.gold ?? 0,
        silver: coins.silver ?? 0,
        copper: coins.copper ?? 0,
    };
}

function droppedFieldsOf(
    doc: StoredDocument,
    known: readonly string[],
): string[] {
    return Object.keys(doc).filter(
        (field) => !REMOVED_FIELDS.includes(field) && !known.includes(field),
    );
}

function damageOf(damage: unknown): StoredDocument {
    const { type, power } = damage as StoredDocument;
    return { type, power };
}

// un oggetto singolo salvato al posto della lista diventa una lista di un elemento e si riporta (D-04)
function damageListOf(
    value: unknown,
    path: string,
    normalized: string[],
): StoredDocument[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.map(damageOf);
    normalized.push(path);
    return [damageOf(value)];
}

function damagesOf(value: unknown, normalized: string[]): StoredDocument {
    const damages = (value ?? {}) as StoredDocument;
    return {
        base: damageListOf(damages.base, 'damages.base', normalized),
        energy: damageListOf(damages.energy, 'damages.energy', normalized),
    };
}

function exported(
    doc: StoredDocument,
    known: readonly string[],
    entry: EntryObject,
    normalized: string[] = [],
): ExportedEntry {
    return { entry, normalized, dropped: droppedFieldsOf(doc, known) };
}

// D-23: la città di una lore è quella che la collega in cities.relatedLore
export function loreEntryOf(
    doc: StoredDocument,
    cityByLore: ReadonlyMap<string, string>,
): ExportedEntry {
    const id = hexOf(doc._id) as string;
    const city = doc.type === 'city' ? cityByLore.get(id) : undefined;
    return exported(doc, LORE_FIELDS, {
        id,
        type: doc.type ?? null,
        name: doc.name ?? null,
        description: doc.description ?? null,
        image: doc.image ?? null,
        relatedLore: hexListOf(doc.relatedLore),
        ...(city ? { city } : {}),
    });
}

export function spellEntryOf(doc: StoredDocument): ExportedEntry {
    const energyDamage = doc.energyDamage as StoredDocument | undefined;
    return exported(doc, SPELL_FIELDS, {
        id: hexOf(doc._id),
        name: doc.name,
        description: doc.description,
        useType: doc.useType,
        energyDamage: energyDamage ? damageOf(energyDamage) : energyDamage,
        requiredLearnTime: doc.requiredLearnTime,
        minXpToLearn: doc.minXpToLearn,
        recoveryTime: doc.recoveryTime,
        maxUsages: doc.maxUsages,
    });
}

function assetHeadOf(doc: StoredDocument): EntryObject {
    return {
        id: hexOf(doc._id),
        name: doc.name,
        itemType: doc.itemType,
        description: doc.description,
        sellPrice: coinsOf(doc.sellPrice),
        buyPrice: coinsOf(doc.buyPrice),
        rarity: doc.rarity,
    };
}

// sellable è legacy fuori schema Mongoose: si conserva solo se il documento lo porta
const legacySellableOf = (doc: StoredDocument): EntryObject =>
    doc.sellable === undefined ? {} : { sellable: doc.sellable };

export function equipmentEntryOf(doc: StoredDocument): ExportedEntry {
    const normalized: string[] = [];
    const entry = {
        ...assetHeadOf(doc),
        equipType: doc.equipType,
        addedSpell: hexOrNull(doc.addedSpell),
        damages: damagesOf(doc.damages, normalized),
        ...legacySellableOf(doc),
    };
    return exported(doc, EQUIPMENT_FIELDS, entry, normalized);
}

export function lootEntryOf(doc: StoredDocument): ExportedEntry {
    return exported(doc, LOOT_FIELDS, {
        ...assetHeadOf(doc),
        power: doc.power,
        effect: doc.effect,
        ...legacySellableOf(doc),
    });
}

// le copie embedded (Pitfall 8) tornano id del catalogo; il nemico esportato è un mostro con valori espliciti (D-04)
function spellIdOf(spell: unknown): unknown {
    if (spell instanceof ObjectId) return spell.toHexString();
    return hexOf((spell as StoredDocument)._id);
}

export function enemyEntryOf(doc: StoredDocument): ExportedEntry {
    const normalized: string[] = [];
    const entry = {
        id: hexOf(doc._id),
        name: doc.name,
        category: 'monster',
        locations: listOf(doc.locations),
        energyWeaknesses: listOf(doc.energyWeaknesses),
        baseWeaknesses: listOf(doc.baseWeaknesses),
        relatedLore: hexListOf(doc.relatedLore),
        spells: listOf(doc.spells).map(spellIdOf),
        imagePath: doc.imagePath,
        xp: doc.xp,
        lifePoints: doc.lifePoints,
        damages: damagesOf(doc.damages, normalized),
    };
    return exported(doc, ENEMY_FIELDS, entry, normalized);
}

export function petEntryOf(doc: StoredDocument): ExportedEntry {
    const normalized: string[] = [];
    const entry = {
        id: hexOf(doc._id),
        name: doc.name,
        damages: damagesOf(doc.damages, normalized),
        buyPrice: coinsOf(doc.buyPrice),
        sellPrice: coinsOf(doc.sellPrice),
        xp: doc.xp,
        maxXp: doc.maxXp,
        currentLifePoints: doc.currentLifePoints,
        maxLifePoints: doc.maxLifePoints,
        imagePath: doc.imagePath,
        speedModifier: doc.speedModifier ?? null,
    };
    return exported(doc, PET_FIELDS, entry, normalized);
}

// un tipo legacy scalare resta com'è ma in lista: lo ripulisce il fix normalizePoiTypes (Pitfall 5)
function poiTypesOf(type: unknown): unknown[] {
    if (Array.isArray(type)) return [...(type as unknown[])];
    return type === null || type === undefined ? [] : [type];
}

function worldPoiOf(poi: StoredDocument): EntryObject {
    return {
        id: hexOf(poi._id),
        type: poiTypesOf(poi.type),
        location: listOf(poi.location),
    };
}

const byHexId = (a: StoredDocument, b: StoredDocument): number =>
    String(hexOf(a._id)).localeCompare(String(hexOf(b._id)));

// Pitfall 10: location resta [lng, lat] com'è a DB
export function worldCityOf(
    city: StoredDocument,
    pois: readonly StoredDocument[],
): EntryObject {
    return {
        id: hexOf(city._id),
        name: city.name,
        type: city.type,
        markerLocation: hexOrNull(city.markerLocation),
        relatedLore: hexOrNull(city.relatedLore),
        pointsOfInterest: [...pois].sort(byHexId).map(worldPoiOf),
    };
}
