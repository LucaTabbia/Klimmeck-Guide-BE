import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsNumber,
    IsString,
    Matches,
} from 'class-validator';
import {
    IdField,
    NestedList,
    Nullable,
    OneOf,
    Text,
} from 'src/content/schema/common.content';
import { CityType } from 'src/models/enums/city-type.enum';

// T-11-15: le immagini arrivano solo dall'account Cloudinary del progetto (D-24)
export const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\//;

const LOCATION_MESSAGE = 'deve essere [lng, lat]';

export class WorldPoiEntry {
    @IdField()
    id: string;

    // lo snapshot riporta i tipi come sono a DB, anche sporchi: li ripulisce il fix normalizePoiTypes
    @IsArray({ message: 'deve essere una lista' })
    @IsString({ each: true, message: 'contiene un tipo non testuale' })
    type: string[];

    @IsArray({ message: LOCATION_MESSAGE })
    @ArrayMinSize(2, { message: LOCATION_MESSAGE })
    @ArrayMaxSize(2, { message: LOCATION_MESSAGE })
    @IsNumber({}, { each: true, message: LOCATION_MESSAGE })
    location: [number, number];
}

export class WorldCityEntry {
    @IdField()
    id: string;

    @Text()
    name: string;

    @OneOf(Object.values(CityType))
    type: CityType;

    @IdField()
    markerLocation: string;

    @Nullable()
    @IdField()
    relatedLore: string | null;

    @NestedList(() => WorldPoiEntry)
    pointsOfInterest: WorldPoiEntry[];
}

export class ImageLinkEntry {
    @IdField()
    id: string;

    @IsString({ message: 'deve essere un testo' })
    @Matches(CLOUDINARY_URL, {
        message: 'deve iniziare con https://res.cloudinary.com/',
    })
    url: string;
}
