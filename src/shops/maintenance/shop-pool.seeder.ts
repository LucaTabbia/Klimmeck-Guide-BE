import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { citySizeOf } from 'src/cities/city-size';
import { City, CityDocument } from 'src/models/city.model';
import { CityType } from 'src/models/enums/city-type.enum';
import { EffectType } from 'src/models/enums/effect-type.enum';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import {
    drawEquipment,
    drawLoot,
    petsFor,
    placementsOf,
} from '../shop-pool.draw';
import {
    NO_SHOP_CITY_TYPES,
    SELLABLE_PET_PLACEMENTS,
    SHOP_REPORT_WARNINGS_LIMIT,
} from '../shop-pool.constants';
import { SeedCandidate } from '../shop-pool.rules';

export interface ShopSeedReport {
    equipment: number;
    loot: number;
    pets: number;
    deferred: number;
}

type PoolField = 'shopEquipment' | 'shopLoot' | 'shopPets';

interface SeedCity {
    _id: Types.ObjectId;
    name?: string | null;
    type: CityType;
    shopEquipment?: Types.ObjectId[];
    shopLoot?: Types.ObjectId[];
    shopPets?: Types.ObjectId[];
}

interface ShopCatalogue {
    equipment: SeedCandidate[];
    loot: SeedCandidate[];
    pets: SeedCandidate[];
}

interface PoolWrite {
    cityId: Types.ObjectId;
    ids: Types.ObjectId[];
}

interface GuaranteeGap {
    city: SeedCity;
    missing: EffectType[];
}

interface SeedPlan {
    writes: Record<PoolField, PoolWrite[]>;
    gaps: GuaranteeGap[];
    deferred: number;
}

const SHELF_PROJECTION = { rarity: 1, sellable: 1, buyPrice: 1, effect: 1 };
const PET_PROJECTION = { name: 1, sellable: 1, buyPrice: 1 };
const POOL_FIELDS: readonly PoolField[] = [
    'shopEquipment',
    'shopLoot',
    'shopPets',
];

// assente = chiave mancante dal documento lean, mai «lista vuota» (D-03, D-22)
const isAbsent = (city: SeedCity, field: PoolField) =>
    city[field] === undefined;

// un compagno piazzato ma non ancora a catalogo rinvia la lista: scritta vuota resterebbe chiusa per sempre (D-22)
function placedPets(
    city: SeedCity,
    pets: readonly SeedCandidate[],
): Types.ObjectId[] | undefined {
    const ids = petsFor(city, pets);
    return ids.length < placementsOf(city).length ? undefined : ids;
}

// una lista seminata, oppure undefined = rinviata al boot successivo (D-22)
function drawPool(
    city: SeedCity,
    field: PoolField,
    catalogue: ShopCatalogue,
    gaps: GuaranteeGap[],
): Types.ObjectId[] | undefined {
    if (NO_SHOP_CITY_TYPES.includes(city.type)) return [];
    const size = citySizeOf(city.type);
    if (field === 'shopPets')
        return catalogue.pets.length > 0
            ? placedPets(city, catalogue.pets)
            : undefined;
    if (field === 'shopEquipment') {
        const ids = drawEquipment(city._id, size, catalogue.equipment);
        return ids.length > 0 ? ids : undefined;
    }
    const { ids, missingGuarantees } = drawLoot(city._id, size, catalogue.loot);
    if (ids.length === 0) return undefined;
    if (missingGuarantees.length > 0)
        gaps.push({ city, missing: missingGuarantees });
    return ids;
}

function planPools(cities: SeedCity[], catalogue: ShopCatalogue): SeedPlan {
    const plan: SeedPlan = {
        writes: { shopEquipment: [], shopLoot: [], shopPets: [] },
        gaps: [],
        deferred: 0,
    };
    for (const city of cities)
        for (const field of POOL_FIELDS.filter((f) => isAbsent(city, f))) {
            const ids = drawPool(city, field, catalogue, plan.gaps);
            if (ids === undefined) plan.deferred += 1;
            else plan.writes[field].push({ cityId: city._id, ids });
        }
    return plan;
}

// nessun hook di boot proprio: lo chiama l'orchestratore della semina (D-24)
@Injectable()
export class ShopPoolSeeder {
    private readonly logger = new Logger(ShopPoolSeeder.name);

    constructor(
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
        @InjectModel(EquipmentItem.name)
        private readonly equipmentModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootModel: Model<LootItemDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
    ) {}

    async seedAll(): Promise<ShopSeedReport> {
        const catalogue = await this.readCatalogue();
        const plan = planPools(await this.citiesToSeed(), catalogue);
        this.warnGuaranteeGaps(plan.gaps);
        const report: ShopSeedReport = {
            equipment: await this.writePools(
                'shopEquipment',
                plan.writes.shopEquipment,
            ),
            loot: await this.writePools('shopLoot', plan.writes.shopLoot),
            pets: await this.writePools('shopPets', plan.writes.shopPets),
            deferred: plan.deferred,
        };
        if (report.pets > 0) await this.checkPetPlacements();
        this.logReport(report);
        return report;
    }

    private async readCatalogue(): Promise<ShopCatalogue> {
        return {
            equipment: await this.equipmentModel
                .find({}, SHELF_PROJECTION)
                .lean<SeedCandidate[]>()
                .exec(),
            loot: await this.lootModel
                .find({}, SHELF_PROJECTION)
                .lean<SeedCandidate[]>()
                .exec(),
            pets: await this.petModel
                .find({}, PET_PROJECTION)
                .lean<SeedCandidate[]>()
                .exec(),
        };
    }

    private async citiesToSeed(): Promise<SeedCity[]> {
        return this.cityModel
            .find(
                {
                    $or: POOL_FIELDS.map((field) => ({
                        [field]: { $exists: false },
                    })),
                },
                {
                    name: 1,
                    type: 1,
                    shopEquipment: 1,
                    shopLoot: 1,
                    shopPets: 1,
                },
            )
            .sort({ _id: 1 })
            .lean<SeedCity[]>()
            .exec();
    }

    // il filtro di esistenza resta anche in scrittura: due boot concorrenti non riscrivono la cura (D-03)
    private async writePools(
        field: PoolField,
        writes: PoolWrite[],
    ): Promise<number> {
        if (writes.length === 0) return 0;
        const result = await this.cityModel.bulkWrite(
            writes.map(({ cityId, ids }) => ({
                updateOne: {
                    filter: { _id: cityId, [field]: { $exists: false } },
                    update: { $set: { [field]: ids } },
                },
            })) as never,
        );
        return result.modifiedCount;
    }

    private warnGuaranteeGaps(gaps: GuaranteeGap[]): void {
        gaps.slice(0, SHOP_REPORT_WARNINGS_LIMIT).forEach(({ city, missing }) =>
            this.logger.warn(
                `Negozi: ${city.name ?? city._id.toHexString()} (${city.type}) senza le garanzie di loot ${missing.join(', ')}`,
            ),
        );
        const omitted = gaps.length - SHOP_REPORT_WARNINGS_LIMIT;
        if (omitted > 0)
            this.logger.warn(
                `Negozi: altre ${omitted} liste di loot senza le garanzie non elencate`,
            );
    }

    // solo dopo una semina dei compagni: un riavvio senza scritture non rilegge né avvisa (D-10)
    private async checkPetPlacements(): Promise<void> {
        for (const pet of SELLABLE_PET_PLACEMENTS)
            for (const { name, type } of pet.cities) {
                const found = await this.cityModel
                    .countDocuments({ name, type })
                    .exec();
                if (found !== 1)
                    this.logger.warn(
                        `Piazzamento del compagno ${pet.name}: città ${name} (${type}) trovata ${found} volte`,
                    );
            }
    }

    private logReport({ equipment, loot, pets, deferred }: ShopSeedReport) {
        if (equipment + loot + pets > 0)
            this.logger.log(
                `Negozi: seminate ${equipment} liste di equipaggiamenti, ${loot} di loot, ${pets} di compagni`,
            );
        if (deferred > 0)
            this.logger.warn(
                `Negozi: ${deferred} liste rinviate al prossimo boot, catalogo senza candidati`,
            );
    }
}
