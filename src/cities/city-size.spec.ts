import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { CITY_SIZE_BY_TYPE, citySizeOf } from './city-size';

function sizeFromSuffix(type: CityType): CitySize {
    if (type.endsWith('Village')) return CitySize.village;
    if (type.endsWith('Capital')) return CitySize.capital;
    return CitySize.city;
}

describe('citySizeOf', () => {
    it.each(Object.values(CityType))(
        'derives the size of every CityType from its suffix (D-01): %s',
        (type) => {
            expect(citySizeOf(type)).toBe(sizeFromSuffix(type));
        },
    );

    it('sizes the special types of the explicit table (D-01)', () => {
        expect(citySizeOf(CityType.elfCapital)).toBe(CitySize.capital);
        expect(citySizeOf(CityType.talmvereVillage)).toBe(CitySize.village);
        expect(citySizeOf(CityType.ferrionCity)).toBe(CitySize.city);
        expect(citySizeOf(CityType.necrorianCity)).toBe(CitySize.city);
    });

    it('sells the sea cities as cities (D-02)', () => {
        expect(citySizeOf(CityType.drusteaSeaCity)).toBe(CitySize.city);
        expect(citySizeOf(CityType.valanSeaCity)).toBe(CitySize.city);
        expect(citySizeOf(CityType.mirwaSeaCity)).toBe(CitySize.city);
    });

    it('counts 13 villages, 11 cities and 9 capitals (D-01)', () => {
        const sizes: CitySize[] = Object.values(CITY_SIZE_BY_TYPE);
        const countOf = (size: CitySize) =>
            sizes.filter((value) => value === size).length;

        expect({
            village: countOf(CitySize.village),
            city: countOf(CitySize.city),
            capital: countOf(CitySize.capital),
        }).toEqual({ village: 13, city: 11, capital: 9 });
    });
});
