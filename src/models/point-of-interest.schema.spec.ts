import { PointOfInterestSchema } from './point-of-interest.model';

const POINT_OF_INTEREST_PATHS = ['_id', 'city', 'location', 'type'];

describe('point of interest schema', () => {
    it('declares no back link to a quest on the point of interest (D-09)', () => {
        expect(Object.keys(PointOfInterestSchema.paths).sort()).toEqual(
            POINT_OF_INTEREST_PATHS,
        );
    });
});
