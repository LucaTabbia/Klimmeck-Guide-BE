import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QUEST_GENERATION_CONFIG } from 'src/config/quest-generation-config';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { CityDocument, City } from 'src/models/city.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { describeError, isDuplicateKeyError } from 'src/mongo/mongo-errors';
import {
    CityNode,
    cityWeightOf,
    densityOf,
    freePoisOf,
    neighboursOf,
    pickCity,
    pickPoi,
} from 'src/quests/generation/city-picker';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    PetCandidate,
    PrizeCatalogItem,
    prizesOf,
} from 'src/quests/generation/generated-prizes';
import { generatedQuestDraftOf } from 'src/quests/generation/generated-quest-draft';
import {
    GENERATED_RANKS,
    GeneratedRank,
    isGeneratedRank,
    leastCoveredRank,
} from 'src/quests/generation/generation-rules';
import {
    Composition,
    composeQuest,
} from 'src/quests/generation/quest-composition';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import { recommendedLootOf } from 'src/quests/generation/recommended-loot';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

type RankCounts = Partial<Record<GeneratedRank, number>>;

interface LeanCity {
    _id: Types.ObjectId;
    name?: string | null;
    markerLocation?: Types.ObjectId | null;
    pointsOfInterest?: Types.ObjectId[] | null;
    relatedLore?: Types.ObjectId | null;
}

interface LeanPoi {
    _id: Types.ObjectId;
    type?: unknown;
    location?: unknown;
}

interface LeanOpenQuest {
    generated?: boolean | null;
    infos?: { markerLocation?: Types.ObjectId | null } | null;
    requirements?: { minTitle?: unknown } | null;
}

interface LeanEnemy {
    _id: Types.ObjectId;
    name?: string | null;
    xp?: unknown;
    locations?: unknown;
    legendary?: unknown;
    relatedLore?: Types.ObjectId[] | null;
    baseWeaknesses?: unknown;
    energyWeaknesses?: unknown;
}

interface LeanEquipment {
    _id: Types.ObjectId;
    rarity?: string | null;
    equipType?: string | null;
    damages?: unknown;
}

interface LeanLoot {
    _id: Types.ObjectId;
    rarity?: string | null;
    effect?: string | null;
    power?: number | null;
}

interface WorldCity extends CityNode {
    name: string;
    relatedLore: string | null;
}

interface GenerationWorld {
    cities: WorldCity[];
    cityCount: number;
    poiTypes: Map<string, string[]>;
    generatedPerCity: Map<string, number>;
    rankCounts: RankCounts;
    openGenerated: number;
    enemies: EnemyCandidate[];
    catalog: PrizeCatalogItem[];
    pets: PetCandidate[];
}

const hexOf = (id: Types.ObjectId | null | undefined): string | null =>
    id ? id.toHexString() : null;

const stringsOf = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
};

function locationOf(poi: LeanPoi | undefined): [number, number] | null {
    const location = poi?.location;
    if (!Array.isArray(location) || location.length < 2) return null;
    const [x, y] = location as unknown[];
    return typeof x === 'number' && typeof y === 'number' ? [x, y] : null;
}

const enemyCandidateOf = (enemy: LeanEnemy): EnemyCandidate => ({
    id: enemy._id.toHexString(),
    name: enemy.name ?? '',
    xp: typeof enemy.xp === 'number' ? enemy.xp : 0,
    locations: stringsOf(enemy.locations),
    // passato così com'è: il filtro dei pool è fail-closed (D-04)
    legendary: enemy.legendary,
    relatedLore: (enemy.relatedLore ?? []).map((id) => id.toHexString()),
    baseWeaknesses: stringsOf(enemy.baseWeaknesses),
    energyWeaknesses: stringsOf(enemy.energyWeaknesses),
});

// meno coperto prima (leastCoveredRank), poi gli altri per copertura crescente; parità → rango più basso (D-15)
function ranksByCoverage(counts: RankCounts): GeneratedRank[] {
    const first = leastCoveredRank(counts);
    const rest = GENERATED_RANKS.filter((rank) => rank !== first).sort(
        (left, right) => (counts[left] ?? 0) - (counts[right] ?? 0),
    );
    return [first, ...rest];
}

@Injectable()
export class QuestGenerator extends QuestGenerationTrigger {
    private readonly logger = new Logger(QuestGenerator.name);
    private inFlight: Promise<number> | null = null;
    private rerun = false;
    private closed = false;

    constructor(
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(EquipmentItem.name)
        private readonly equipmentModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootModel: Model<LootItemDocument>,
        @InjectModel(Pet.name)
        private readonly petModel: Model<PetDocument>,
        @Inject(QUEST_GENERATION_CONFIG)
        private readonly config: QuestGenerationConfig,
        private readonly chance: ChanceSource,
    ) {
        super();
    }

    // single-flight (D-17): le chiamate concorrenti ricevono la stessa corsa; un rerun chiesto a fine corsa riparte subito, salvo dopo close()
    generate(): Promise<number> {
        this.inFlight ??= this.drain().finally(() => {
            this.inFlight = null;
            if (this.rerun && !this.closed) this.startSafely();
        });
        return this.inFlight;
    }

    // fire-and-forget: accoda al più un rerun della corsa in volo (D-17); no-op dopo close()
    request(): void {
        if (this.closed) return;
        this.rerun = true;
        this.startSafely();
    }

    // attende anche la corsa riavviata dal rerun del finally
    async whenIdle(): Promise<void> {
        while (this.inFlight) {
            await this.inFlight.catch(() => undefined);
        }
    }

    // allo stop: nessuna nuova corsa da request() né dal rerun; generate() esplicito resta ammesso (D-16)
    async close(): Promise<void> {
        this.closed = true;
        this.rerun = false;
        await this.whenIdle();
    }

    private startSafely(): void {
        void this.generate().catch((error) =>
            this.logger.error(
                `Generatore: corsa fallita (${describeError(error)})`,
            ),
        );
    }

    private async drain(): Promise<number> {
        let created = 0;
        do {
            this.rerun = false;
            created += await this.runOnce();
        } while (this.rerun);
        return created;
    }

    // una quest alla volta fino al target (D-15); a mondo pieno 0
    private async runOnce(): Promise<number> {
        const world = await this.readWorld();
        const target = this.config.target ?? world.cityCount;
        const missing = target - world.openGenerated;
        if (missing <= 0) return 0;
        const neighbours = neighboursOf(world.cities);
        let created = 0;
        try {
            while (created < missing) {
                const city = this.pickCityOf(world, neighbours);
                if (city === null) break;
                const poiId = pickPoi(city.freePoiIds, this.chance);
                city.freePoiIds = city.freePoiIds.filter((id) => id !== poiId);
                const rank = await this.createOn(world, city, poiId);
                if (rank === null) continue;
                created += 1;
                world.generatedPerCity.set(
                    city.id,
                    (world.generatedPerCity.get(city.id) ?? 0) + 1,
                );
                world.rankCounts[rank] = (world.rankCounts[rank] ?? 0) + 1;
            }
            return created;
        } finally {
            this.logCreated(created, target);
        }
    }

    // anche quando una create lancia: le quest già scritte restano a DB
    private logCreated(created: number, target: number): void {
        if (created === 0) return;
        this.logger.log(
            `Generatore: ${created} missioni create (target ${target})`,
        );
    }

    private pickCityOf(
        world: GenerationWorld,
        neighbours: ReadonlyMap<string, readonly string[]>,
    ): WorldCity | null {
        const weights = new Map(
            world.cities.map((city) => [
                city.id,
                cityWeightOf(
                    city,
                    densityOf(city.id, neighbours, world.generatedPerCity),
                    world.generatedPerCity.get(city.id) ?? 0,
                ),
            ]),
        );
        const picked = pickCity(world.cities, weights, this.chance);
        return world.cities.find((city) => city.id === picked?.id) ?? null;
    }

    // POI già tolto dai liberi: un POI non componibile o preso da un'altra corsa (E11000, D-28) esce dalla corsa
    private async createOn(
        world: GenerationWorld,
        city: WorldCity,
        poiId: string,
    ): Promise<GeneratedRank | null> {
        const composition = this.compositionFor(
            world,
            world.poiTypes.get(poiId) ?? [],
        );
        if (composition === null) return null;
        const prizes = prizesOf({
            type: composition.type,
            rank: composition.rank,
            catalog: world.catalog,
            pets: world.pets,
            chance: this.chance,
        });
        const recommendedLoot = recommendedLootOf({
            rank: composition.rank,
            enemies: composition.enemies.map((entry) => entry.enemy),
            catalog: world.catalog,
        });
        const draft = generatedQuestDraftOf({
            composition,
            poiId,
            city: { name: city.name, relatedLore: city.relatedLore },
            prizes,
            recommendedLoot,
            chance: this.chance,
        });
        try {
            await this.questModel.create(draft);
            return composition.rank;
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            this.logger.warn(
                `Generatore: POI ${poiId} già occupato da un'altra corsa, si prosegue`,
            );
            return null;
        }
    }

    // il rango meno coperto prima; se il POI non lo compone, gli altri per copertura (D-15)
    private compositionFor(
        world: GenerationWorld,
        poiTypes: readonly string[],
    ): Composition | null {
        for (const rank of ranksByCoverage(world.rankCounts)) {
            const composition = composeQuest({
                rank,
                enemies: world.enemies,
                poiTypes,
                chance: this.chance,
            });
            if (composition !== null) return composition;
        }
        return null;
    }

    private async readWorld(): Promise<GenerationWorld> {
        const cities = await this.cityModel
            .find({})
            .select('_id name markerLocation pointsOfInterest relatedLore')
            .sort({ _id: 1 })
            .lean<LeanCity[]>();
        const poiIds = cities.flatMap((city) => [
            ...(city.markerLocation ? [city.markerLocation] : []),
            ...(city.pointsOfInterest ?? []),
        ]);
        const pois = await this.poiModel
            .find({ _id: { $in: poiIds } })
            .select('_id type location')
            .lean<LeanPoi[]>();
        const poiById = new Map(
            pois.map((poi) => [poi._id.toHexString(), poi]),
        );
        const openQuests = await this.questModel
            .find({ concludedAt: null })
            .select('generated infos.markerLocation requirements.minTitle')
            .lean<LeanOpenQuest[]>();
        const occupied = new Set(
            openQuests
                .map((quest) => hexOf(quest.infos?.markerLocation))
                .filter((id): id is string => id !== null),
        );
        const poiCity = new Map<string, string>();
        const worldCities: WorldCity[] = [];
        for (const city of cities) {
            const cityId = city._id.toHexString();
            const cityPois = (city.pointsOfInterest ?? [])
                .map((id) => id.toHexString())
                .filter((id) => poiById.has(id));
            for (const id of cityPois) poiCity.set(id, cityId);
            const markerLocation = hexOf(city.markerLocation);
            const location = locationOf(
                markerLocation === null
                    ? undefined
                    : poiById.get(markerLocation),
            );
            if (markerLocation === null || location === null) continue;
            worldCities.push({
                id: cityId,
                location,
                freePoiIds: freePoisOf(
                    { markerLocation, pointsOfInterest: cityPois },
                    occupied,
                ),
                name: city.name ?? '',
                relatedLore: hexOf(city.relatedLore),
            });
        }
        const generated = openQuests.filter(
            (quest) => quest.generated === true,
        );
        const generatedPerCity = new Map<string, number>();
        const rankCounts: RankCounts = {};
        for (const quest of generated) {
            const cityId = poiCity.get(
                hexOf(quest.infos?.markerLocation) ?? '',
            );
            if (cityId !== undefined) {
                generatedPerCity.set(
                    cityId,
                    (generatedPerCity.get(cityId) ?? 0) + 1,
                );
            }
            const rank = quest.requirements?.minTitle;
            if (isGeneratedRank(rank)) {
                rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
            }
        }
        return {
            cities: worldCities,
            cityCount: cities.length,
            poiTypes: new Map(
                pois.map((poi) => [poi._id.toHexString(), stringsOf(poi.type)]),
            ),
            generatedPerCity,
            rankCounts,
            openGenerated: generated.length,
            enemies: await this.readEnemies(),
            catalog: await this.readCatalog(),
            pets: await this.readPets(),
        };
    }

    // solo i non leggendari marcati (D-04): un nemico senza flag resta fuori
    private async readEnemies(): Promise<EnemyCandidate[]> {
        const enemies = await this.enemyModel
            .find({ legendary: false })
            .select(
                '_id name xp locations legendary relatedLore baseWeaknesses energyWeaknesses',
            )
            .sort({ _id: 1 })
            .lean<LeanEnemy[]>();
        return enemies.map(enemyCandidateOf);
    }

    private async readCatalog(): Promise<PrizeCatalogItem[]> {
        const equipment = await this.equipmentModel
            .find({})
            .select('_id rarity equipType damages')
            .sort({ _id: 1 })
            .lean<LeanEquipment[]>();
        const loot = await this.lootModel
            .find({})
            .select('_id rarity effect power')
            .sort({ _id: 1 })
            .lean<LeanLoot[]>();
        return [
            ...equipment.map(
                (item): PrizeCatalogItem => ({
                    itemType: 'EquipmentItem',
                    id: item._id.toHexString(),
                    rarity: item.rarity ?? null,
                    equipType: item.equipType ?? null,
                    damages: item.damages,
                }),
            ),
            ...loot.map(
                (item): PrizeCatalogItem => ({
                    itemType: 'LootItem',
                    id: item._id.toHexString(),
                    rarity: item.rarity ?? null,
                    effect: item.effect ?? null,
                    power: item.power ?? null,
                }),
            ),
        ];
    }

    // pool dei pet da quest: solo i non vendibili (D-21)
    private async readPets(): Promise<PetCandidate[]> {
        const pets = await this.petModel
            .find({ sellable: false })
            .select('_id')
            .sort({ _id: 1 })
            .lean<{ _id: Types.ObjectId }[]>();
        return pets.map((pet) => ({ id: pet._id.toHexString() }));
    }
}
