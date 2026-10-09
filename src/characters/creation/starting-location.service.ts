import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CharacterCreationException } from 'src/characters/creation/character-creation.exception';
import { RACE_HOME_CITY_TYPES } from 'src/characters/creation/race-traits';
import { RandomSource } from 'src/characters/creation/random-source';
import { City, CityDocument } from 'src/models/city.model';
import { CityType } from 'src/models/enums/city-type.enum';
import { RaceType } from 'src/models/enums/race-type.enum';
import { PointOfInterest } from 'src/models/point-of-interest.model';

function isObjectId(value: unknown): value is Types.ObjectId {
    return value instanceof Types.ObjectId;
}

@Injectable()
export class StartingLocationService {
    constructor(
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterest>,
        private readonly randomSource: RandomSource,
    ) {}

    // scelta piatta tra tutte le città patria esistenti: con una sola capitale seedata si parte da lì
    async resolveFor(race: RaceType): Promise<Types.ObjectId> {
        const candidates = await this.findHomeMarkers(
            RACE_HOME_CITY_TYPES[race],
        );
        if (candidates.length === 0) {
            throw CharacterCreationException.startingLocationUnavailable();
        }
        return candidates[this.randomSource.pickIndex(candidates.length)];
    }

    private async findHomeMarkers(
        types: readonly CityType[],
    ): Promise<Types.ObjectId[]> {
        const cities = await this.cityModel
            .find({ type: { $in: types } })
            .select({ markerLocation: 1 })
            .sort({ _id: 1 })
            .lean()
            .exec();
        const markers = cities
            .map((city) => city.markerLocation)
            .filter(isObjectId);
        const existing = await this.existingPoiIds(markers);
        return markers.filter((marker) => existing.has(marker.toHexString()));
    }

    private async existingPoiIds(
        markers: Types.ObjectId[],
    ): Promise<Set<string>> {
        if (markers.length === 0) return new Set();
        const pois = await this.poiModel
            .find({ _id: { $in: markers } })
            .select({ _id: 1 })
            .lean()
            .exec();
        return new Set(pois.map((poi) => String(poi._id)));
    }
}
