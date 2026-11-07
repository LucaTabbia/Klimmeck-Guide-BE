import type { Connection, Model, Schema } from 'mongoose';
import { Types } from 'mongoose';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { Lore, LoreDocument, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import type { AuthTestApp } from '../auth/auth-test-app';
import {
    createPlayer,
    type PlayerOptions,
    type TestPlayer,
} from '../authz/player-fixture';
import { buildCharacter, persistCity, persistLore } from '../fixtures';

export interface GeographyLoreWorld {
    cityLore: LoreDocument;
    regions: LoreDocument[];
    state: LoreDocument;
    // un character e una religion collegati alla città: mai aperti dalla geografia (D-03)
    others: LoreDocument[];
    // ordine delle relatedLore della città, come geographyOf
    geography: Types.ObjectId[];
}

// CityDocument non porta _id nel tipo (City & Document globale)
export interface GeographyWorld extends GeographyLoreWorld {
    city: CityDocument & { _id: Types.ObjectId };
    marker: Types.ObjectId;
}

function modelOf(
    connection: Connection,
    name: string,
    schema: Schema,
): Model<any> {
    return connection.models[name] ?? connection.model(name, schema);
}

function idOf(document: LoreDocument): Types.ObjectId {
    return (document as unknown as { _id: Types.ObjectId })._id;
}

export async function persistGeographyLore(
    connection: Connection,
    options: { name?: string; regions?: number } = {},
): Promise<GeographyLoreWorld> {
    const loreModel = modelOf(connection, Lore.name, LoreSchema);
    const name = options.name ?? 'Drustea';
    const regions: LoreDocument[] = [];
    for (let index = 0; index < (options.regions ?? 1); index += 1) {
        regions.push(
            await persistLore(loreModel, {
                type: LoreType.region,
                name: `${name} regione ${index + 1}`,
            }),
        );
    }
    const state = await persistLore(loreModel, {
        type: LoreType.state,
        name: `${name} stato`,
    });
    const character = await persistLore(loreModel, {
        type: LoreType.character,
        name: `${name} personaggio`,
    });
    const religion = await persistLore(loreModel, {
        type: LoreType.religion,
        name: `${name} religione`,
    });
    const [firstRegion, ...otherRegions] = regions;
    const cityLore = await persistLore(loreModel, {
        type: LoreType.city,
        name,
        relatedLore: [
            idOf(firstRegion),
            idOf(character),
            idOf(state),
            ...otherRegions.map(idOf),
            idOf(religion),
        ],
    });
    return {
        cityLore,
        regions,
        state,
        others: [character, religion],
        geography: [
            idOf(cityLore),
            idOf(firstRegion),
            idOf(state),
            ...otherRegions.map(idOf),
        ],
    };
}

export async function persistGeography(
    connection: Connection,
    options: { name?: string; regions?: number; cityType?: string } = {},
): Promise<GeographyWorld> {
    const world = await persistGeographyLore(connection, options);
    const city = (await persistCity(
        modelOf(connection, City.name, CitySchema),
        {
            name: options.name ?? 'Drustea',
            type: options.cityType ?? 'drusteaCapital',
            relatedLore: idOf(world.cityLore),
        },
        modelOf(connection, PointOfInterest.name, PointOfInterestSchema),
    )) as GeographyWorld['city'];
    const marker = city.markerLocation as Types.ObjectId;
    return { ...world, city, marker };
}

export async function playerKnowing(
    harness: AuthTestApp,
    options: PlayerOptions & {
        lore?: Types.ObjectId[];
        enemies?: Types.ObjectId[];
    },
): Promise<TestPlayer> {
    const { lore, enemies, ...playerOptions } = options;
    return createPlayer(harness, {
        ...playerOptions,
        characterOverrides: {
            ...playerOptions.characterOverrides,
            status: {
                ...buildCharacter().status,
                unlockedLore: lore ?? [],
                knownEnemies: enemies ?? [],
            },
        },
    });
}
