import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City, CityDocument } from 'src/models/city.model';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import {
    CatalogueEntry,
    hasViolations,
    isSeeded,
    ReportedCity,
    ShopCatalogue,
    ShopPoolViolation,
    violationsOf,
} from './shop-pool.report';

export interface ShopPoolReport {
    entries: ShopPoolViolation[];
    unseeded: number;
}

const CITY_PROJECTION = {
    name: 1,
    type: 1,
    shopEquipment: 1,
    shopLoot: 1,
    shopPets: 1,
};
const CATALOGUE_PROJECTION = { name: 1, rarity: 1, sellable: 1 };

// sola lettura (D-06): letture lean fuori da qualsiasi transazione, nessuna correzione (D-05)
@Injectable()
export class ShopPoolReportService {
    constructor(
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
        @InjectModel(EquipmentItem.name)
        private readonly equipmentModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootModel: Model<LootItemDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    ) {}

    async report(): Promise<ShopPoolReport> {
        const [cities, catalogue] = await Promise.all([
            this.cityModel
                .find({}, CITY_PROJECTION)
                .lean<ReportedCity[]>()
                .exec(),
            this.readCatalogue(),
        ]);
        const seeded = cities.filter(isSeeded);
        const entries = seeded
            .map((city) => violationsOf(city, catalogue))
            .filter(hasViolations)
            .sort((left, right) => left.cityName.localeCompare(right.cityName));
        return { entries, unseeded: cities.length - seeded.length };
    }

    private async readCatalogue(): Promise<ShopCatalogue> {
        const [equipment, loot, pets] = await Promise.all(
            [this.equipmentModel, this.lootModel, this.petModel].map(
                (model: Model<any>) =>
                    model
                        .find({}, CATALOGUE_PROJECTION)
                        .lean<CatalogueEntry[]>()
                        .exec(),
            ),
        );
        return {
            equipment: byHex(equipment),
            loot: byHex(loot),
            pets: byHex(pets),
        };
    }
}

function byHex(entries: CatalogueEntry[]): Map<string, CatalogueEntry> {
    return new Map(entries.map((entry) => [entry._id.toHexString(), entry]));
}
