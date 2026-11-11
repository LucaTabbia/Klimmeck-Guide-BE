import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QUEST_GENERATION_CONFIG } from 'src/config/quest-generation-config';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { citySizeOf, isCityType } from 'src/cities/city-size';
import { CityDocument, City } from 'src/models/city.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { Lore, LoreDocument } from 'src/models/lore.model';
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
import { stringsOf } from 'src/mongo/lean-values';
import { readEnemyCandidates } from 'src/quests/generation/enemy-candidate';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    PrizeCatalogItem,
    prizesOf,
} from 'src/quests/generation/generated-prizes';
import { readPetCandidates } from 'src/quests/generation/pet-candidate';
import { PetCandidate } from 'src/quests/generation/pet-prize';
import { generatedQuestDraftOf } from 'src/quests/generation/generated-quest-draft';
import { readPrizeCatalog } from 'src/quests/generation/prize-catalog';
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
    type?: unknown;
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

function locationOf(poi: LeanPoi | undefined): [number, number] | null {
    const location = poi?.location;
    if (!Array.isArray(location) || location.length < 2) return null;
    const [x, y] = location as unknown[];
    return typeof x === 'number' && typeof y === 'number' ? [x, y] : null;
}

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
        @InjectModel(Lore.name)
        private readonly loreModel: Model<LoreDocument>,
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

    // una quest alla volta fino al target (D-15) col tetto per taglia (13.1 D-04); a mondo pieno 0
    // ordine dei tiri per quest, da non spostare (le spec a seme fisso ne dipendono):
    // pickCity (1) → pickPoi (1) → composeQuest per ogni rango provato (vedi quest-composition.ts)
    // → prizesOf (loot, poi un tiro di fascia del pet per ogni quest e l'indice se la fascia ha candidati,
    // Phase 19 D-28: vedi generated-prizes.ts) → announcementOf (1, in generated-quest-draft.ts)
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
        const poiTypes = world.poiTypes.get(poiId) ?? [];
        const composition = this.compositionFor(world, poiTypes);
        if (composition === null) return null;
        const prizes = prizesOf({
            type: composition.type,
            rank: composition.rank,
            catalog: world.catalog,
            pets: world.pets,
            enemyIds: composition.enemies.map((entry) => entry.enemy.id),
            poiTypes,
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

    // fail-closed senza silenzio: un type scritto male a DB si vede nel log (13.1 D-04)
    private warnUnknownTypes(cityIds: readonly string[]): void {
        if (cityIds.length === 0) return;
        this.logger.warn(
            `Generatore: ${cityIds.length} città con tipo sconosciuto saltate (${cityIds.join(', ')})`,
        );
    }

    private async readWorld(): Promise<GenerationWorld> {
        const cities = await this.cityModel
            .find({})
            .select('_id name type markerLocation pointsOfInterest relatedLore')
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
        const unknownTypes: string[] = [];
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
            if (!isCityType(city.type)) {
                unknownTypes.push(cityId);
                continue;
            }
            worldCities.push({
                id: cityId,
                location,
                freePoiIds: freePoisOf(
                    { markerLocation, pointsOfInterest: cityPois },
                    occupied,
                ),
                name: city.name ?? '',
                relatedLore: hexOf(city.relatedLore),
                size: citySizeOf(city.type),
            });
        }
        this.warnUnknownTypes(unknownTypes);
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

    // la lore animale si legge una volta per corsa (13.1 D-01)
    private readEnemies(): Promise<EnemyCandidate[]> {
        return readEnemyCandidates(this.enemyModel, this.loreModel);
    }

    private readCatalog(): Promise<PrizeCatalogItem[]> {
        return readPrizeCatalog(this.equipmentModel, this.lootModel);
    }

    // tutti i pet con rarità, vendibilità e zona del nemico collegato (Phase 19 D-28)
    private readPets(): Promise<PetCandidate[]> {
        return readPetCandidates(this.petModel, this.enemyModel);
    }
}
