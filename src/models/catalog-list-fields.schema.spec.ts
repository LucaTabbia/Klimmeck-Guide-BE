import { model } from 'mongoose';
import { EnemySchema } from './enemy.model';
import { PoiType } from './enums/poi-type.enum';
import { PointOfInterestSchema } from './point-of-interest.model';

const EnemyProbe = model('CatalogListEnemyProbe', EnemySchema);
const PointOfInterestProbe = model(
    'CatalogListPointOfInterestProbe',
    PointOfInterestSchema,
);

describe('catalog list fields', () => {
    it('stores enemy locations as a list of point of interest types (D-17b)', () => {
        expect(EnemySchema.path('locations').instance).toBe('Array');

        const enemy = new EnemyProbe({ name: 'Goblin' });

        expect(enemy.toObject().locations).toEqual([]);
    });

    it('stores the point of interest type as a list (D-17b)', () => {
        expect(PointOfInterestSchema.path('type').instance).toBe('Array');

        const pointOfInterest = new PointOfInterestProbe({
            location: [1, 2],
        });

        expect(pointOfInterest.toObject().type).toEqual([]);
    });

    it('reads a legacy scalar type as a one-element list (D-17b)', () => {
        const pointOfInterest = PointOfInterestProbe.hydrate({
            type: PoiType.city,
        });

        expect(pointOfInterest.toObject().type).toEqual([PoiType.city]);
    });

    it('reads a legacy scalar enemy location as a one-element list (D-17b)', () => {
        const enemy = EnemyProbe.hydrate({
            name: 'Goblin',
            locations: PoiType.city,
        });

        expect(enemy.toObject().locations).toEqual([PoiType.city]);
    });

    it('rejects an unknown enemy location', () => {
        const enemy = new EnemyProbe({ name: 'Goblin', locations: ['nope'] });

        const error = enemy.validateSync();

        expect(Object.keys(error?.errors ?? {})).toEqual(['locations.0']);
    });

    it('rejects an unknown point of interest type', () => {
        const pointOfInterest = new PointOfInterestProbe({
            type: ['nope'],
            location: [1, 2],
        });

        const error = pointOfInterest.validateSync();

        expect(Object.keys(error?.errors ?? {})).toEqual(['type.0']);
    });
});
