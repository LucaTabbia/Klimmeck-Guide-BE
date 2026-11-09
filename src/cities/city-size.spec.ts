import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { CITY_SIZE_BY_TYPE, citySizeOf, isCityType } from './city-size';

const CAPITALS_WITHOUT_SUFFIX: readonly CityType[] = [
    CityType.ferrionCity,
    CityType.necrorianCity,
];

function expectedSizeOf(type: CityType): CitySize {
    if (CAPITALS_WITHOUT_SUFFIX.includes(type)) return CitySize.capital;
    if (type.endsWith('Village')) return CitySize.village;
    if (type.endsWith('Capital')) return CitySize.capital;
    return CitySize.city;
}

describe('citySizeOf', () => {
    it.each(Object.values(CityType))(
        'derives the size of every CityType from its suffix, Ferrion and Necrorian aside (quick 261109-cap): %s',
        (type) => {
            expect(citySizeOf(type)).toBe(expectedSizeOf(type));
        },
    );

    it('sizes the special types of the explicit table (D-01)', () => {
        expect(citySizeOf(CityType.elfCapital)).toBe(CitySize.capital);
        expect(citySizeOf(CityType.talmvereVillage)).toBe(CitySize.village);
    });

    it('sizes Ferrion and Necrorian as capitals (quick 261109-cap)', () => {
        expect(citySizeOf(CityType.ferrionCity)).toBe(CitySize.capital);
        expect(citySizeOf(CityType.necrorianCity)).toBe(CitySize.capital);
    });

    it('sells the sea cities as cities (D-02)', () => {
        expect(citySizeOf(CityType.drusteaSeaCity)).toBe(CitySize.city);
        expect(citySizeOf(CityType.valanSeaCity)).toBe(CitySize.city);
        expect(citySizeOf(CityType.mirwaSeaCity)).toBe(CitySize.city);
    });

    it('counts 13 villages, 9 cities and 11 capitals (quick 261109-cap)', () => {
        const sizes: CitySize[] = Object.values(CITY_SIZE_BY_TYPE);
        const countOf = (size: CitySize) =>
            sizes.filter((value) => value === size).length;

        expect({
            village: countOf(CitySize.village),
            city: countOf(CitySize.city),
            capital: countOf(CitySize.capital),
        }).toEqual({ village: 13, city: 9, capital: 11 });
    });

    it('recognises only the city types of the size table (D-04)', () => {
        expect(isCityType('drusteaVillage')).toBe(true);
        expect(isCityType('atlantis')).toBe(false);
        expect(isCityType('toString')).toBe(false);
        expect(isCityType(undefined)).toBe(false);
        expect(isCityType(7)).toBe(false);
    });
});
