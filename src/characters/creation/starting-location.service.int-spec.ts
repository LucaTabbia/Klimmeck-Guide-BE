import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import mongoose, { Model, Types } from 'mongoose';
import { CharacterCreationException } from 'src/characters/creation/character-creation.exception';
import { RandomSource } from 'src/characters/creation/random-source';
import { StartingLocationService } from 'src/characters/creation/starting-location.service';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { RaceType } from 'src/models/enums/race-type.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { FixedRandomSource } from '../../../test/characters/fixed-random-source';
import { persistCity, persistPoi } from '../../../test/fixtures';

const CityModel: Model<CityDocument> =
    mongoose.models.City || mongoose.model(City.name, CitySchema);
const PoiModel: Model<PointOfInterest> =
    mongoose.models.PointOfInterest ||
    mongoose.model(PointOfInterest.name, PointOfInterestSchema);

async function createHomeCity(type: string): Promise<Types.ObjectId> {
    const city = await persistCity(CityModel, { type }, PoiModel);
    return city.markerLocation as Types.ObjectId;
}

async function expectUnavailable(promise: Promise<unknown>): Promise<void> {
    const error: unknown = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CharacterCreationException);
    expect((error as CharacterCreationException).code).toBe(
        'STARTING_LOCATION_UNAVAILABLE',
    );
}

describe('StartingLocationService (replSet)', () => {
    const random = new FixedRandomSource();
    let service: StartingLocationService;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                StartingLocationService,
                { provide: getModelToken(City.name), useValue: CityModel },
                {
                    provide: getModelToken(PointOfInterest.name),
                    useValue: PoiModel,
                },
                { provide: RandomSource, useValue: random },
            ],
        }).compile();
        service = moduleRef.get(StartingLocationService);
    });

    beforeEach(() => {
        random.setIndex(0);
        random.requestedLengths.length = 0;
    });

    it('starts an elf on the marker of the elf capital', async () => {
        const marker = await createHomeCity('elfCapital');

        const location = await service.resolveFor(RaceType.elf);

        expect(location).toEqual(marker);
        expect(location).toBeInstanceOf(Types.ObjectId);
    });

    it.each([
        ['gnome', 'motherCapital'],
        ['dwarf', 'motherCapital'],
        ['tiefling', 'motherCapital'],
        ['halfling', 'liberiaCapital'],
        ['aarakocra', 'aarakocraVillage'],
        ['dragonborn', 'mountainVillage'],
    ])('starts a %s in a %s', async (race, cityType) => {
        await createHomeCity('elfCapital');
        const marker = await createHomeCity(cityType);

        await expect(service.resolveFor(race as RaceType)).resolves.toEqual(
            marker,
        );
    });

    it.each([0, 1, 2, 3])(
        'picks a human home flat among the four capitals (index %i)',
        async (index) => {
            const markers = [
                await createHomeCity('drusteaCapital'),
                await createHomeCity('valanCapital'),
                await createHomeCity('mirwaCapital'),
                await createHomeCity('liberiaCapital'),
            ];
            await createHomeCity('elfCapital');
            random.setIndex(index);

            await expect(service.resolveFor(RaceType.human)).resolves.toEqual(
                markers[index],
            );
            expect(random.requestedLengths).toEqual([4]);
        },
    );

    it('degrades to the only seeded capital for a halfelf', async () => {
        const marker = await createHomeCity('valanCapital');

        await expect(service.resolveFor(RaceType.halfelf)).resolves.toEqual(
            marker,
        );
        expect(random.requestedLengths).toEqual([1]);
    });

    it('keeps the city creation order for the pick', async () => {
        await createHomeCity('motherCapital');
        const second = await createHomeCity('motherCapital');
        random.setIndex(1);

        await expect(service.resolveFor(RaceType.dwarf)).resolves.toEqual(
            second,
        );
    });

    it('fails with STARTING_LOCATION_UNAVAILABLE without a home city', async () => {
        await createHomeCity('elfCapital');

        await expectUnavailable(service.resolveFor(RaceType.dwarf));
    });

    it('fails with STARTING_LOCATION_UNAVAILABLE when the marker POI does not exist', async () => {
        await persistCity(CityModel, { type: 'elfCapital' });

        await expectUnavailable(service.resolveFor(RaceType.elf));
    });

    it('skips home cities whose marker POI does not exist', async () => {
        await persistCity(CityModel, { type: 'elfCapital' });
        const marker = await createHomeCity('elfCapital');

        await expect(service.resolveFor(RaceType.elf)).resolves.toEqual(marker);
        expect(random.requestedLengths).toEqual([1]);
    });

    it('fails with STARTING_LOCATION_UNAVAILABLE when the marker is stored as a string (D-20)', async () => {
        const poi = await persistPoi(PoiModel);
        await CityModel.collection.insertOne({
            type: 'elfCapital',
            name: 'Raw',
            area: [],
            markerLocation: String(poi._id),
            pointsOfInterest: [],
        });

        await expectUnavailable(service.resolveFor(RaceType.elf));
    });
});
