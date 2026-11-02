import {
    addedCity,
    buildGeneratorIndex,
    cityId,
} from './generator-world.fixture';

describe('addedCity', () => {
    it('refuses a city whose id is already in the test world', () => {
        expect(() =>
            buildGeneratorIndex(
                addedCity({
                    n: 13,
                    name: 'Talmvere',
                    type: 'talmvereVillage',
                    pois: [['forest']],
                }),
            ),
        ).toThrow(cityId(13));
    });
});
