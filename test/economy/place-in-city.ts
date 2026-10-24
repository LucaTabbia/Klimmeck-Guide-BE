import { Types, type Connection, type Model } from 'mongoose';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { persistCity } from '../fixtures';

// C4: nessuna suite del negozio creava città; mette una City col marker sulla posizione attuale del personaggio (D-18)
export async function placeInCity(
    harness: { connection: Connection },
    character: { status: { location?: unknown } },
): Promise<CityDocument> {
    const cities = (harness.connection.models[City.name] ??
        harness.connection.model(City.name, CitySchema)) as Model<CityDocument>;
    return (await persistCity(cities, {
        name: `Shop City ${new Types.ObjectId().toHexString()}`,
        markerLocation: character.status.location,
    })) as CityDocument;
}
