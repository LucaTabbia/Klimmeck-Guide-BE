// UNA TANTUM (Phase 19 D-12): inserisce e rilegge col driver nativo le fixture nella forma vecchia (lo strict dei modelli scarterebbe i campi tolti) — esce dal repo dopo il boot reale
import type { Connection, Types } from 'mongoose';

type RawDocument = Record<string, unknown>;

export async function insertLegacy(
    connection: Connection,
    modelName: string,
    doc: RawDocument,
): Promise<Types.ObjectId> {
    const { insertedId } = await connection
        .model(modelName)
        .collection.insertOne(doc);
    return insertedId;
}

export async function rawById(
    connection: Connection,
    modelName: string,
    id: Types.ObjectId,
): Promise<RawDocument | null> {
    return connection.model(modelName).collection.findOne({ _id: id });
}

// nemico nella forma vecchia: due liste al posto del sotto-documento; un override `undefined` toglie il campo
export function legacyEnemy(overrides: RawDocument = {}): RawDocument {
    const enemy: RawDocument = {
        name: 'Nemico vecchio',
        locations: [],
        relatedLore: [],
        xp: 100,
        spells: [],
        lifePoints: 1000,
        imagePath: 'enemies/test.png',
        legendary: false,
        damages: { base: [{ type: 'cut', power: 100 }], energy: [] },
        baseWeaknesses: [],
        energyWeaknesses: [],
        ...overrides,
    };
    return Object.fromEntries(
        Object.entries(enemy).filter(([, value]) => value !== undefined),
    );
}

// nemico nella forma vecchia delle magie: copie incorporate (o già ref) al posto della lista di soli ref
export function legacyEnemyWithSpells(
    copies: readonly unknown[],
    overrides: RawDocument = {},
): RawDocument {
    return legacyEnemy({ spells: [...copies], ...overrides });
}
