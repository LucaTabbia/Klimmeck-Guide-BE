import { Types, type Connection, type Model } from 'mongoose';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { persistCity } from '../fixtures';

interface WithConnection {
    connection: Connection;
}

// il modello City dell'harness, registrato sulla connessione se il modulo di test non lo fa
export function cityModelOf(harness: WithConnection): Model<CityDocument> {
    return (harness.connection.models[City.name] ??
        harness.connection.model(City.name, CitySchema)) as Model<CityDocument>;
}

export interface ShopPoolFixture {
    equipment?: readonly unknown[];
    loot?: readonly unknown[];
    pets?: readonly unknown[];
}

// C4: nessuna suite del negozio creava città; mette una City col marker sulla posizione attuale del personaggio (D-18)
// pool opzionale: senza, la città resta senza pool come quelle delle fixture (D-22); con, le sole liste date vanno nel sotto-documento del pool (D-10, D-19)
export async function placeInCity(
    harness: WithConnection,
    character: { status: { location?: unknown } },
    pool: ShopPoolFixture = {},
): Promise<CityDocument> {
    const hasPool = Object.values(pool).some((list) => list !== undefined);
    return (await persistCity(cityModelOf(harness), {
        name: `Shop City ${new Types.ObjectId().toHexString()}`,
        markerLocation: character.status.location,
        ...(hasPool ? { shop: pool } : {}),
    })) as CityDocument;
}
