import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';

// esaustiva: un CityType nuovo non compila senza taglia (D-01)
export const CITY_SIZE_BY_TYPE = {
    drusteaVillage: CitySize.village,
    aarakocraVillage: CitySize.village,
    valanVillage: CitySize.village,
    mirwaVillage: CitySize.village,
    desertVillage: CitySize.village,
    tropicalVillage: CitySize.village,
    mountainVillage: CitySize.village,
    northVillage: CitySize.village,
    forestVillage: CitySize.village,
    flameVillage: CitySize.village,
    motherVillage: CitySize.village,
    liberiaVillage: CitySize.village,
    talmvereVillage: CitySize.village,
    drusteaCity: CitySize.city,
    drusteaSeaCity: CitySize.city,
    ferrionCity: CitySize.city,
    necrorianCity: CitySize.city,
    valanCity: CitySize.city,
    valanSeaCity: CitySize.city,
    mirwaCity: CitySize.city,
    mirwaSeaCity: CitySize.city,
    flameCity: CitySize.city,
    motherCity: CitySize.city,
    liberiaCity: CitySize.city,
    drusteaCapital: CitySize.capital,
    elfCapital: CitySize.capital,
    valanCapital: CitySize.capital,
    mirwaCapital: CitySize.capital,
    flameNorthCapital: CitySize.capital,
    flameCenterCapital: CitySize.capital,
    flameSouthCapital: CitySize.capital,
    motherCapital: CitySize.capital,
    liberiaCapital: CitySize.capital,
} as const satisfies Record<CityType, CitySize>;

export function citySizeOf(type: CityType): CitySize {
    return CITY_SIZE_BY_TYPE[type];
}
