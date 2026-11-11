// UNA TANTUM (Phase 19 D-12): inserisce e rilegge col driver nativo le fixture nella forma vecchia (lo strict dei modelli scarterebbe i campi tolti) — esce dal repo dopo il boot reale
import { type Connection, Types } from 'mongoose';

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

function withoutUndefined(doc: RawDocument): RawDocument {
    return Object.fromEntries(
        Object.entries(doc).filter(([, value]) => value !== undefined),
    );
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
    return withoutUndefined(enemy);
}

// nemico nella forma vecchia delle magie: copie incorporate (o già ref) al posto della lista di soli ref
export function legacyEnemyWithSpells(
    copies: readonly unknown[],
    overrides: RawDocument = {},
): RawDocument {
    return legacyEnemy({ spells: [...copies], ...overrides });
}

// pet a catalogo nella forma vecchia: danni in un solo ramo e stato (xp, vita corrente) sul catalogo; un override `undefined` toglie il campo
export function legacyPet(overrides: RawDocument = {}): RawDocument {
    return withoutUndefined({
        name: 'Pet vecchio',
        damages: { base: [{ type: 'cut', power: 30 }], energy: [] },
        buyPrice: { gold: 0, silver: 1, copper: 0 },
        sellPrice: { gold: 0, silver: 0, copper: 50 },
        xp: 0,
        maxXp: 100,
        currentLifePoints: 10,
        maxLifePoints: 10,
        imagePath: 'pets/test.png',
        speedModifier: null,
        ...overrides,
    });
}

// POI nella forma vecchia: porta il back-link morto verso una quest (nullo come a DB); un override `undefined` toglie il campo
export function legacyPoi(overrides: RawDocument = {}): RawDocument {
    return withoutUndefined({
        type: ['ruins'],
        location: [12.5, 41.9],
        city: new Types.ObjectId(),
        quest: null,
        ...overrides,
    });
}

// l'indice unico dei nomi dei personaggi attivi vuole un nome diverso per fixture
let characterSequence = 0;

// personaggio nella forma vecchia dei posseduti: lista di soli riferimenti (o di ciò che il test ci mette); un override di `assets` si fonde con quelli di base
export function legacyCharacterWithPets(
    petRefs: readonly unknown[],
    overrides: RawDocument = {},
): RawDocument {
    const { assets, ...rest } = overrides;
    return withoutUndefined({
        infos: {
            sex: 'male',
            name: `Personaggio vecchio ${++characterSequence}`,
            race: 'human',
            pronoun: 'he',
            classType: 'fighter',
            age: 20,
            background: 'test',
            imagePath: null,
        },
        status: {
            xp: 20000,
            level: 1,
            location: new Types.ObjectId(),
            title: 'rookie',
            injuries: [],
            spells: [],
            spellStates: [],
            coins: { gold: 0, silver: 0, copper: 0 },
            currentLifePoints: 100,
            maxLifePoints: 100,
        },
        quests: { completedQuests: [], pendingQuest: null },
        assets: withoutUndefined({
            ownedEquipments: [],
            ownedItems: [],
            wearedEquipment: {},
            activeSpells: [],
            ownedPets: [...petRefs],
            pet: null,
            ...(assets as RawDocument | undefined),
        }),
        deletedAt: null,
        ...rest,
    });
}
