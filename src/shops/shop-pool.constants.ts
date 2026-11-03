// costanti dei negozi: le fasce di rarità per taglia guidano solo il report (D-06, D-08), ciò che sta a DB vince (D-05)
import { CitySize } from 'src/models/enums/city-size.enum';
import { CityType } from 'src/models/enums/city-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';

// dalla più comune; legendary mai, a nessuna taglia (D-05, D-08)
export const SHOP_ALLOWED_RARITIES = {
    village: [RarityType.common, RarityType.uncommon],
    city: [RarityType.common, RarityType.uncommon, RarityType.rare],
    capital: [
        RarityType.common,
        RarityType.uncommon,
        RarityType.rare,
        RarityType.ultrarare,
    ],
} as const satisfies Record<CitySize, readonly RarityType[]>;

// Necrorian ha solo la dungeon (Phase 11 D-17): pool vuoto esplicito (D-04)
export const NO_SHOP_CITY_TYPES: readonly CityType[] = [CityType.necrorianCity];

export const SHOP_REPORT_WARNINGS_LIMIT = 50;
