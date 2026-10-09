import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RACE_HOME_CITY_TYPES } from 'src/characters/creation/race-traits';
import { City, CityDocument } from 'src/models/city.model';
import { RaceType } from 'src/models/enums/race-type.enum';
import { describeMongoError } from 'src/mongo/mongo-errors';

export function racesWithoutHomeCity(
    availableCityTypes: readonly string[],
): RaceType[] {
    const available = new Set(availableCityTypes);
    return Object.values(RaceType).filter(
        (race) =>
            !RACE_HOME_CITY_TYPES[race].some((type) => available.has(type)),
    );
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

// i dati delle città possono arrivare dopo il deploy: si avvisa, non si blocca il boot (D-10)
@Injectable()
export class StartingCitiesReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger(StartingCitiesReporter.name);

    constructor(
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            const cityTypes: unknown[] = await this.cityModel
                .distinct('type')
                .exec();
            for (const race of racesWithoutHomeCity(
                cityTypes.filter(isString),
            )) {
                this.logger.warn(
                    `No home city for race ${race} (expected city type: ${RACE_HOME_CITY_TYPES[race].join(', ')}): createCharacter answers STARTING_LOCATION_UNAVAILABLE for this race until one is seeded.`,
                );
            }
        } catch (error) {
            this.logger.error(
                `Home cities could not be checked at boot (${describeMongoError(error)}).`,
            );
        }
    }
}
