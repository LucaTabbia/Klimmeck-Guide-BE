import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    QUEST_GENERATION_CONFIG,
    QuestGenerationConfig,
} from 'src/config/quest-generation-config';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { CitySize } from 'src/models/enums/city-size.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Lore } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { QuestGenerationTrigger } from 'src/quests/generation/quest-generation-trigger';
import { QuestGenerationTriggerModule } from 'src/quests/generation/quest-generation-trigger.module';
import {
    budgetOf,
    coverageRankOf,
    GeneratedRank,
    RANK_XP_BANDS,
} from 'src/quests/generation/generation-rules';
import { QuestGenerator } from 'src/quests/generation/quest-generator.service';
import { readEnemyCandidates } from 'src/quests/generation/enemy-candidate';
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    buildCity,
    buildQuest,
    persistEnemy,
    persistPoi,
} from '../../../test/fixtures';
import {
    GenerationModels,
    GenerationWorld,
    HERO_BAND_ENEMY_XPS,
    LinkedPet,
    persistGenerationWorld,
    persistLinkedPets,
    QUIET_GENERATION_CONFIG,
    seatViolationsOf,
    STANDARD_ENEMY_XPS,
    WORLD_HABITAT,
} from '../../../test/quests/generation-world';

type LeanAsset = { itemType: string; item: Types.ObjectId; quantity: number };

type LeanPrizeBlock = {
    prizeCoins?: unknown;
    xpPrize?: number | null;
    prizeItem?: unknown;
    randomLoot?: LeanAsset[];
    spell?: unknown;
    pet?: Types.ObjectId | null;
};

type LeanPrizes = LeanPrizeBlock & {
    spellDraw?: boolean;
    rankPrizes?: (LeanPrizeBlock & { title: string; cure?: unknown })[];
};

// mondo senza candidati boss: nessun nemico sopra la fascia adventurer (13.1 D-03)
const NO_BOSS_ENEMY_XPS: readonly number[] = [8, 12, 22, 30, 45, 60];

type LeanQuest = {
    _id: Types.ObjectId;
    generated?: boolean;
    infos: {
        title: string;
        type: string;
        description?: string;
        markerLocation: Types.ObjectId;
        enemies: { enemy: Types.ObjectId; quantity: number }[];
    };
    prizes?: LeanPrizes;
    requirements: {
        minTitle: string;
        requiredPoints?: number | null;
        requiredAdventurers: { title: string | null; count: number }[];
        recommendedLoot?: LeanAsset[];
    };
    concludedAt?: Date | null;
};

describe('QuestGenerator (replSet)', () => {
    let harness: AuthTestApp;
    let models: GenerationModels;
    let quests: Model<QuestDocument>;

    const modelOf = (name: string) =>
        harness.app.get<Model<any>>(getModelToken(name));

    function generatorWith(
        config: Partial<QuestGenerationConfig> = {},
        options: { chance?: ChanceSource; questModel?: Model<any> } = {},
    ): QuestGenerator {
        return new QuestGenerator(
            models.cities as never,
            models.pois as never,
            (options.questModel ?? quests) as never,
            models.enemies as never,
            models.lore as never,
            models.equipment as never,
            models.loot as never,
            models.pets as never,
            { ...QUIET_GENERATION_CONFIG, ...config },
            options.chance ?? new SeededChanceSource(7),
        );
    }

    async function generatedQuests(): Promise<LeanQuest[]> {
        return quests
            .find({ generated: true })
            .sort({ _id: 1 })
            .lean<LeanQuest[]>();
    }

    function cityOfPoi(world: GenerationWorld, poi: Types.ObjectId): string {
        const city = world.cities.find((candidate) =>
            candidate.poiIds.some((id) => id.equals(poi)),
        );
        return city ? city.id.toHexString() : 'none';
    }

    function countBy<T>(items: readonly T[], keyOf: (item: T) => string) {
        const counts: Record<string, number> = {};
        for (const item of items) {
            const key = keyOf(item);
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return counts;
    }

    // per ogni quest generata: il nemico legato al pet offerto (null senza pet) e i nemici della quest
    function offeredPetsOf(
        created: readonly LeanQuest[],
        linked: readonly LinkedPet[],
    ) {
        const enemyOfPet = new Map(
            linked.map((pet) => [
                pet.id.toHexString(),
                pet.enemyId.toHexString(),
            ]),
        );
        return created.map((quest) => {
            const pet = quest.prizes?.pet ?? null;
            return {
                offered: pet !== null,
                petEnemy: pet ? enemyOfPet.get(pet.toHexString()) : undefined,
                questEnemies: quest.infos.enemies.map((entry) =>
                    entry.enemy.toHexString(),
                ),
            };
        });
    }

    async function insertOpenGenerated(
        minTitle: TitleType,
        markerLocation = new Types.ObjectId(),
    ): Promise<void> {
        const base = buildQuest();
        await quests.collection.insertOne({
            ...base,
            infos: { ...base.infos, type: QuestType.enemy, markerLocation },
            requirements: { ...base.requirements, minTitle },
            generated: true,
            concludedAt: null,
        });
    }

    async function insertOpenMixedBoss(): Promise<void> {
        const base = buildQuest();
        await quests.collection.insertOne({
            ...base,
            infos: {
                ...base.infos,
                type: QuestType.boss,
                markerLocation: new Types.ObjectId(),
            },
            requirements: {
                ...base.requirements,
                minTitle: TitleType.paladin,
                requiredAdventurers: [
                    { title: TitleType.mage, count: 3 },
                    { title: TitleType.paladin, count: 1 },
                ],
            },
            generated: true,
            concludedAt: null,
        });
    }

    const coverageOf = (quest: LeanQuest): GeneratedRank | null =>
        coverageRankOf(quest);

    // nomi al posto degli id: la stessa corsa su due mondi dà la stessa istantanea
    async function namesById(): Promise<Map<string, string>> {
        const named: { _id: Types.ObjectId; name: string }[] = [];
        for (const model of [models.enemies, models.equipment, models.loot]) {
            named.push(
                ...(await model
                    .find({})
                    .lean<{ _id: Types.ObjectId; name: string }[]>()),
            );
        }
        return new Map(named.map((doc) => [doc._id.toHexString(), doc.name]));
    }

    async function runSnapshotOf(world: GenerationWorld, linked: LinkedPet[]) {
        const names = await namesById();
        const enemyOfPet = new Map(
            linked.map((pet) => [
                pet.id.toHexString(),
                names.get(pet.enemyId.toHexString()),
            ]),
        );
        const nameOf = (id: Types.ObjectId): string | undefined =>
            names.get(id.toHexString());
        const assetsOf = (assets: readonly LeanAsset[] = []) =>
            assets.map((asset) => `${nameOf(asset.item)}x${asset.quantity}`);
        const poiOf = (poi: Types.ObjectId): string => {
            const cityIndex = world.cities.findIndex((city) =>
                city.poiIds.some((id) => id.equals(poi)),
            );
            const poiIndex = world.cities[cityIndex].poiIds.findIndex((id) =>
                id.equals(poi),
            );
            return `${cityIndex}:${poiIndex}`;
        };
        return (await generatedQuests()).map((quest) => ({
            title: quest.infos.title,
            type: quest.infos.type,
            description: quest.infos.description,
            poi: poiOf(quest.infos.markerLocation),
            enemies: quest.infos.enemies.map(
                (entry) => `${nameOf(entry.enemy)}x${entry.quantity}`,
            ),
            minTitle: quest.requirements.minTitle,
            seats: quest.requirements.requiredAdventurers,
            recommendedLoot: assetsOf(quest.requirements.recommendedLoot),
            prizeKeys: Object.keys(quest.prizes ?? {}).sort(),
            prizeCoins: quest.prizes?.prizeCoins,
            xpPrize: quest.prizes?.xpPrize,
            randomLoot: assetsOf(quest.prizes?.randomLoot),
            pet: quest.prizes?.pet
                ? (enemyOfPet.get(quest.prizes.pet.toHexString()) ?? 'other')
                : null,
        }));
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestGenerationTriggerModule],
            overrides: [
                { token: ChanceSource, useValue: new SeededChanceSource(7) },
                {
                    token: QUEST_GENERATION_CONFIG,
                    useValue: { ...QUIET_GENERATION_CONFIG, target: 2 },
                },
            ],
        });
        models = {
            cities: modelOf(City.name),
            pois: modelOf(PointOfInterest.name),
            enemies: modelOf(Enemy.name),
            lore: modelOf(Lore.name),
            equipment: modelOf(EquipmentItem.name),
            loot: modelOf(LootItem.name),
            pets: modelOf(Pet.name),
        };
        quests = modelOf(Quest.name);
        await quests.createIndexes();
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('wires the generator as the light trigger without a boot run (D-30)', async () => {
        await persistGenerationWorld(models, { cities: 3, poisPerCity: 2 });
        const generator = harness.app.get(QuestGenerator);

        expect(harness.app.get(QuestGenerationTrigger)).toBe(generator);
        expect(await quests.countDocuments()).toBe(0);
        await expect(generator.generate()).resolves.toBe(2);
    });

    it('fills the board up to the target and stops (D-15)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        const generator = generatorWith({ target: 6 });

        await expect(generator.generate()).resolves.toBe(6);
        const created = await generatedQuests();
        expect(created).toHaveLength(6);
        for (const quest of created) {
            expect(quest.generated).toBe(true);
            expect(quest.concludedAt).toBeNull();
            expect(quest.requirements.requiredPoints).toBeNull();
            expect(quest.infos.enemies.length).toBeGreaterThan(0);
        }

        await expect(generator.generate()).resolves.toBe(0);
        expect(await quests.countDocuments({ generated: true })).toBe(6);
    });

    it('defaults the target to the number of cities (D-15)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });

        await expect(generatorWith().generate()).resolves.toBe(4);
        expect(await quests.countDocuments({ generated: true })).toBe(4);
    });

    it('caps a capital at four generated quests (D-04)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 2,
            poisPerCity: 5,
        });

        await expect(generatorWith({ target: 10 }).generate()).resolves.toBe(8);
        const perCity = countBy(await generatedQuests(), (quest) =>
            cityOfPoi(world, quest.infos.markerLocation),
        );
        expect(perCity).toEqual({
            [world.cities[0].id.toHexString()]: 4,
            [world.cities[1].id.toHexString()]: 4,
        });
    });

    it('caps the generated quests by city size (D-04)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 3,
            poisPerCity: 5,
            sizes: [CitySize.village, CitySize.city, CitySize.capital],
        });

        await expect(generatorWith({ target: 10 }).generate()).resolves.toBe(7);
        const perCity = countBy(await generatedQuests(), (quest) =>
            cityOfPoi(world, quest.infos.markerLocation),
        );
        expect(perCity).toEqual({
            [world.cities[0].id.toHexString()]: 1,
            [world.cities[1].id.toHexString()]: 2,
            [world.cities[2].id.toHexString()]: 4,
        });
    });

    it('skips a city with an unknown type, warns once with its id and keeps it in the target (D-04)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 1,
            poisPerCity: 3,
        });
        const unknownId = new Types.ObjectId();
        const marker = await persistPoi(models.pois, {
            type: ['city'],
            location: [1000, 1000],
            city: unknownId,
        });
        const unknownPois: Types.ObjectId[] = [];
        for (let poi = 0; poi < 3; poi += 1) {
            const created = await persistPoi(models.pois, {
                type: [WORLD_HABITAT],
                location: [1001 + poi, 1001 + poi],
                city: unknownId,
            });
            unknownPois.push(created._id as Types.ObjectId);
        }
        await models.cities.collection.insertOne({
            ...buildCity({
                _id: unknownId,
                name: 'Atlantide',
                markerLocation: marker._id,
                pointsOfInterest: [marker._id, ...unknownPois],
            }),
            type: 'atlantis',
        });
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => {});

        await expect(generatorWith().generate()).resolves.toBe(2);
        expect(warn.mock.calls).toEqual([
            [
                `Generatore: 1 città con tipo sconosciuto saltate (${unknownId.toHexString()})`,
            ],
        ]);
        warn.mockRestore();
        const markers = (await generatedQuests()).map(
            (quest) => quest.infos.markerLocation,
        );
        expect(
            markers.filter((id) => unknownPois.some((poi) => poi.equals(id))),
        ).toEqual([]);
        expect(
            countBy(await generatedQuests(), (quest) =>
                cityOfPoi(world, quest.infos.markerLocation),
            ),
        ).toEqual({ [world.cities[0].id.toHexString()]: 2 });
    });

    it('never places a quest on the city marker or on a poi with an open quest (D-15)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 2,
            poisPerCity: 3,
        });
        const taken = world.cities[0].poiIds[0];
        const base = buildQuest();
        await quests.create({
            ...base,
            infos: { ...base.infos, markerLocation: taken },
        });

        await expect(generatorWith({ target: 10 }).generate()).resolves.toBe(5);
        const markers = await generatedQuests();
        const forbidden = [taken, ...world.cities.map((city) => city.markerId)];
        for (const quest of markers) {
            expect(
                forbidden.some((id) => id.equals(quest.infos.markerLocation)),
            ).toBe(false);
        }
        expect(
            new Set(
                markers.map((quest) =>
                    quest.infos.markerLocation.toHexString(),
                ),
            ).size,
        ).toBe(5);
    });

    it('creates only enemy and boss quests, never hunt or dungeon (D-03)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        const base = buildQuest();
        await quests.create({
            ...base,
            infos: { ...base.infos, type: QuestType.dungeon },
        });
        await quests.create(base);

        await generatorWith({ target: 12 }).generate();

        const types = new Set(
            (await generatedQuests()).map((quest) => quest.infos.type),
        );
        expect(
            [...types].every(
                (type) => type === QuestType.enemy || type === QuestType.boss,
            ),
        ).toBe(true);
        expect(await quests.countDocuments({ generated: { $ne: true } })).toBe(
            2,
        );
    });

    it('serves the least covered rank across the world (D-15)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        await insertOpenGenerated(TitleType.rookie);
        await insertOpenGenerated(TitleType.rookie);

        await expect(generatorWith({ target: 3 }).generate()).resolves.toBe(1);
        const [first] = (await generatedQuests()).filter(
            (quest) => quest.infos.title !== 'Test Quest',
        );
        expect(coverageOf(first)).toBe(TitleType.adventurer);
    });

    it('rotates the five ranks and never generates a legend quest (D-02)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });

        await expect(generatorWith({ target: 12 }).generate()).resolves.toBe(
            12,
        );
        const created = await generatedQuests();
        const perRank = countBy(created, (quest) => String(coverageOf(quest)));
        expect(Object.keys(perRank).sort()).toEqual(
            ['adventurer', 'hero', 'mage', 'paladin', 'rookie'].sort(),
        );
        for (const count of Object.values(perRank)) {
            expect(count).toBeGreaterThanOrEqual(2);
        }
        expect(
            created.filter(
                (quest) => quest.requirements.minTitle === TitleType.legend,
            ),
        ).toEqual([]);
        // quick 261111-enm: posti a titolo ai soli boss, del rango e al più dell'inferiore (D-03, D-23)
        expect(seatViolationsOf(created)).toEqual([]);
    });

    it('keeps every generated enemy quest on one seat within the budget (D-03, D-09)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });

        await expect(generatorWith({ target: 12 }).generate()).resolves.toBe(
            12,
        );
        const xps = new Map(
            (
                await models.enemies
                    .find({})
                    .lean<{ _id: Types.ObjectId; xp: number }[]>()
            ).map((enemy) => [enemy._id.toHexString(), enemy.xp]),
        );
        const xpOf = (quest: LeanQuest): number =>
            quest.infos.enemies.reduce(
                (sum, entry) =>
                    sum +
                    (xps.get(entry.enemy.toHexString()) ?? 0) * entry.quantity,
                0,
            );
        const created = await generatedQuests();
        expect(seatViolationsOf(created)).toEqual([]);

        for (const quest of created) {
            const rank = coverageOf(quest) as GeneratedRank;
            if (quest.infos.type === QuestType.boss) {
                expect(quest.infos.enemies).toHaveLength(1);
                expect(xpOf(quest)).toBeGreaterThan(RANK_XP_BANDS[rank].max);
                continue;
            }
            // quick 261111-enm: un posto senza titolo, il rango resta in minTitle
            expect(quest.requirements.requiredAdventurers).toEqual([
                { title: null, count: 1 },
            ]);
            const budget = budgetOf(rank, 1);
            expect(xpOf(quest)).toBeGreaterThanOrEqual(budget.min);
            expect(xpOf(quest)).toBeLessThanOrEqual(budget.max);
        }
    });

    it('skips a poi taken by a concurrent insert and keeps going (D-28)', async () => {
        await persistGenerationWorld(models, { cities: 2, poisPerCity: 3 });
        const race: { poi: Types.ObjectId | null } = { poi: null };
        const racingModel = new Proxy(quests, {
            get(target, property) {
                if (property === 'create') {
                    return async (draft: {
                        infos: { markerLocation: Types.ObjectId };
                    }) => {
                        if (race.poi === null) {
                            race.poi = draft.infos.markerLocation;
                            await target.collection.insertOne({
                                ...(draft as object),
                                _id: new Types.ObjectId(),
                            });
                        }
                        return target.create(draft);
                    };
                }
                const value: unknown = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });

        await expect(
            generatorWith(
                { target: 2 },
                { questModel: racingModel },
            ).generate(),
        ).resolves.toBe(2);
        const created = await generatedQuests();
        expect(created).toHaveLength(3);
        const raced = race.poi as Types.ObjectId;
        expect(raced).toBeInstanceOf(Types.ObjectId);
        expect(
            created.filter((quest) => quest.infos.markerLocation.equals(raced)),
        ).toHaveLength(1);
        expect(
            new Set(
                created.map((quest) =>
                    quest.infos.markerLocation.toHexString(),
                ),
            ).size,
        ).toBe(3);
    });

    it('logs the quests already created when a later create fails (D-15)', async () => {
        await persistGenerationWorld(models, { cities: 2, poisPerCity: 3 });
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => {});
        const failure = new Error('write failed');
        let creates = 0;
        const failingModel = new Proxy(quests, {
            get(target, property) {
                if (property === 'create') {
                    return async (draft: object) => {
                        creates += 1;
                        if (creates === 2) throw failure;
                        return target.create(draft);
                    };
                }
                const value: unknown = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });

        await expect(
            generatorWith(
                { target: 3 },
                { questModel: failingModel },
            ).generate(),
        ).rejects.toBe(failure);
        expect(log).toHaveBeenCalledWith(
            'Generatore: 1 missioni create (target 3)',
        );
        expect(await quests.countDocuments({ generated: true })).toBe(1);
        log.mockRestore();
    });

    it('shares one run between concurrent callers (D-17)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        const generator = generatorWith({ target: 5 });

        const first = generator.generate();
        const second = generator.generate();

        expect(second).toBe(first);
        await expect(Promise.all([first, second])).resolves.toEqual([5, 5]);
        expect(await quests.countDocuments({ generated: true })).toBe(5);
    });

    it('queues one rerun when requested during a run (D-17)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        const generator = generatorWith({ target: 5 });
        const runs = jest.spyOn(
            generator as unknown as { runOnce(): Promise<number> },
            'runOnce',
        );

        const run = generator.generate();
        generator.request();
        generator.request();

        await expect(run).resolves.toBe(5);
        await generator.whenIdle();
        expect(runs).toHaveBeenCalledTimes(2);
        await expect(runs.mock.results[1].value).resolves.toBe(0);
        expect(await quests.countDocuments({ generated: true })).toBe(5);
    });

    it('runs on request when idle and resolves whenIdle after the run (D-17)', async () => {
        await persistGenerationWorld(models, { cities: 3, poisPerCity: 2 });
        const generator = generatorWith();

        await expect(generator.whenIdle()).resolves.toBeUndefined();
        generator.request();
        await generator.whenIdle();

        expect(await quests.countDocuments({ generated: true })).toBe(3);
    });

    it('serves another rank when the least covered one cannot be composed on the poi (D-15)', async () => {
        const nonHeroXps = STANDARD_ENEMY_XPS.filter(
            (xp) => !HERO_BAND_ENEMY_XPS.includes(xp),
        );
        const world = await persistGenerationWorld(models, {
            cities: 1,
            poisPerCity: 1,
            enemyXps: nonHeroXps,
        });
        for (const title of [
            TitleType.rookie,
            TitleType.adventurer,
            TitleType.paladin,
            TitleType.mage,
            TitleType.hero,
        ]) {
            await insertOpenGenerated(title);
        }

        await expect(generatorWith({ target: 6 }).generate()).resolves.toBe(1);
        const [created] = (await generatedQuests()).filter((quest) =>
            quest.infos.markerLocation.equals(world.cities[0].poiIds[0]),
        );
        expect(coverageOf(created)).toBe(TitleType.rookie);
    });

    it('creates nothing without generatable enemies (D-04)', async () => {
        await persistGenerationWorld(models, {
            cities: 2,
            poisPerCity: 2,
            enemyXps: [],
        });
        await persistEnemy(models.enemies, {
            name: 'Leggendario',
            xp: 30,
            locations: [WORLD_HABITAT],
            legendary: true,
        });
        await models.enemies.collection.insertOne({
            name: 'Senza flag',
            xp: 30,
            locations: [WORLD_HABITAT],
            relatedLore: [],
            weaknesses: { base: [], energy: [] },
        });

        await expect(generatorWith({ target: 4 }).generate()).resolves.toBe(0);
        expect(await quests.countDocuments()).toBe(0);
    });

    it('leaves the animals out of every generated quest (D-01)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
            animalXps: STANDARD_ENEMY_XPS,
            enemyLore: true,
        });
        const animalIds = world.animalIds.map((id) => id.toHexString());

        await expect(generatorWith({ target: 12 }).generate()).resolves.toBe(
            12,
        );
        const members = (await generatedQuests()).flatMap((quest) =>
            quest.infos.enemies.map((entry) => entry.enemy.toHexString()),
        );
        expect(members.length).toBeGreaterThan(0);
        expect(members.filter((id) => animalIds.includes(id))).toEqual([]);

        const candidates = await readEnemyCandidates(
            models.enemies as never,
            models.lore as never,
        );
        const animalOf = new Map(
            candidates.map((candidate) => [candidate.id, candidate.animal]),
        );
        expect(animalOf.get(world.enemyIds[0].toHexString())).toBe(false);
        expect(animalIds.map((id) => animalOf.get(id))).toEqual(
            animalIds.map(() => true),
        );
    });

    it('creates nothing when only animals live in the zone (D-01)', async () => {
        await persistGenerationWorld(models, {
            cities: 2,
            poisPerCity: 2,
            enemyXps: [],
            animalXps: [30, 250],
        });

        await expect(generatorWith({ target: 4 }).generate()).resolves.toBe(0);
        expect(await quests.countDocuments()).toBe(0);
    });

    it('offers on a generated quest the pet linked to one of its enemies (D-28)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
        });
        const linked = await persistLinkedPets(models, [
            ...world.enemyIds,
            ...world.legendaryIds,
        ]);

        const created = await generatorWith(
            { target: 8 },
            { chance: new SequenceChance([], 0.05) },
        ).generate();

        // il fallback basso apre anche il cancello del boss misto: i tiri nuovi sono in coda (D-23)
        expect(seatViolationsOf(await generatedQuests())).toEqual([]);
        const offers = offeredPetsOf(await generatedQuests(), linked);
        expect(created).toBeGreaterThan(0);
        expect(offers).toHaveLength(created);
        expect(
            offers.filter(
                (offer) =>
                    offer.petEnemy === undefined ||
                    !offer.questEnemies.includes(offer.petEnemy),
            ),
        ).toEqual([]);
    });

    it('offers a zone pet when the roll falls in the second band (D-28)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
        });
        const linked = await persistLinkedPets(models, [
            ...world.enemyIds,
            ...world.legendaryIds,
        ]);

        const created = await generatorWith(
            { target: 8 },
            { chance: new SequenceChance([], 0.12) },
        ).generate();

        // il fallback basso apre anche il cancello del boss misto: i tiri nuovi sono in coda (D-23)
        expect(seatViolationsOf(await generatedQuests())).toEqual([]);
        const offers = offeredPetsOf(await generatedQuests(), linked);
        expect(created).toBeGreaterThan(0);
        expect(offers).toHaveLength(created);
        expect(
            offers.filter(
                (offer) =>
                    offer.petEnemy === undefined ||
                    offer.questEnemies.includes(offer.petEnemy),
            ),
        ).toEqual([]);
    });

    it('offers no pet while the pets have no rarity (D-28)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
        });
        const linked = await persistLinkedPets(models, world.enemyIds, null);

        const created = await generatorWith(
            { target: 8 },
            { chance: new SequenceChance([], 0.05) },
        ).generate();

        // il fallback basso apre anche il cancello del boss misto: i tiri nuovi sono in coda (D-23)
        expect(seatViolationsOf(await generatedQuests())).toEqual([]);
        const offers = offeredPetsOf(await generatedQuests(), linked);
        expect(created).toBeGreaterThan(0);
        expect(offers).toHaveLength(created);
        expect(offers.filter((offer) => offer.offered)).toEqual([]);
    });

    it('repeats the same quests for the same seed (D-17)', async () => {
        async function runWorld() {
            const world = await persistGenerationWorld(models, {
                cities: 4,
                poisPerCity: 3,
            });
            await generatorWith({ target: 8 }).generate();
            const created = await generatedQuests();
            const poiIndexOf = (poi: Types.ObjectId): string => {
                const cityIndex = world.cities.findIndex((city) =>
                    city.poiIds.some((id) => id.equals(poi)),
                );
                const poiIndex = world.cities[cityIndex].poiIds.findIndex(
                    (id) => id.equals(poi),
                );
                return `${cityIndex}:${poiIndex}`;
            };
            await harness.clearDatabase();
            return created.map((quest) => ({
                title: quest.infos.title,
                poi: poiIndexOf(quest.infos.markerLocation),
                rank: quest.requirements.minTitle,
                seats: quest.requirements.requiredAdventurers,
            }));
        }

        const first = await runWorld();
        const second = await runWorld();

        expect(first).toHaveLength(8);
        expect(second).toEqual(first);
    });

    describe('mixed bosses (D-03, D-23)', () => {
        const MIXED_SEED = 7;

        it('generates mixed bosses with the lower title only (D-03, D-23)', async () => {
            await persistGenerationWorld(models, {
                cities: 6,
                poisPerCity: 5,
            });

            await generatorWith(
                { target: 24 },
                { chance: new SeededChanceSource(MIXED_SEED) },
            ).generate();

            const created = await generatedQuests();
            const bosses = created.filter(
                (quest) => quest.infos.type === QuestType.boss,
            );
            expect(seatViolationsOf(created)).toEqual([]);
            expect(
                bosses.filter(
                    (boss) =>
                        boss.requirements.requiredAdventurers.length === 2,
                ).length,
            ).toBeGreaterThan(0);
            for (const boss of bosses) {
                const seats = boss.requirements.requiredAdventurers;
                const blocks = boss.prizes?.rankPrizes ?? [];
                expect(blocks.map((block) => block.title)).toEqual(
                    seats.map((seat) => seat.title),
                );
                expect(boss.requirements.minTitle).toBe(seats.at(-1)?.title);
                const [highest] = blocks;
                expect({
                    prizeCoins: boss.prizes?.prizeCoins,
                    xpPrize: boss.prizes?.xpPrize,
                    randomLoot: boss.prizes?.randomLoot,
                    pet: boss.prizes?.pet ?? null,
                }).toEqual({
                    prizeCoins: highest.prizeCoins,
                    xpPrize: highest.xpPrize,
                    randomLoot: highest.randomLoot,
                    pet: highest.pet ?? null,
                });
                for (const block of blocks) {
                    expect(block.spell ?? null).toBeNull();
                    expect(block.cure ?? null).toBeNull();
                }
            }
        });

        it('keeps the enemies identical draw by draw (D-23)', async () => {
            const world = await persistGenerationWorld(models, {
                cities: 4,
                poisPerCity: 3,
                enemyXps: NO_BOSS_ENEMY_XPS,
            });
            const linked = await persistLinkedPets(models, world.enemyIds);

            await generatorWith(
                { target: 8 },
                { chance: new SeededChanceSource(7) },
            ).generate();

            expect(await runSnapshotOf(world, linked)).toEqual(
                ENEMY_RUN_BEFORE_MIXED_BOSSES,
            );
        });

        it('counts a mixed boss on its highest seat title (D-23)', async () => {
            await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
            for (const title of [
                TitleType.rookie,
                TitleType.adventurer,
                TitleType.mage,
                TitleType.hero,
            ]) {
                await insertOpenGenerated(title);
            }
            await insertOpenMixedBoss();

            await expect(generatorWith({ target: 6 }).generate()).resolves.toBe(
                1,
            );
            // il boss misto conta come mage: il meno coperto è paladin, non rookie
            const [first] = (await generatedQuests()).filter(
                (quest) => quest.infos.title !== 'Test Quest',
            );
            expect(coverageOf(first)).toBe(TitleType.paladin);
        });

        it('never seeds blocks on hand written quests (D-06)', async () => {
            await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
            const base = buildQuest();
            const handWritten = [
                {
                    ...base,
                    infos: { ...base.infos, type: QuestType.worldMission },
                    requirements: {
                        ...base.requirements,
                        minTitle: TitleType.paladin,
                        requiredAdventurers: [
                            { title: TitleType.mage, count: 2 },
                            { title: TitleType.paladin, count: 1 },
                        ],
                    },
                    concludedAt: null,
                },
                {
                    ...base,
                    infos: {
                        ...base.infos,
                        type: QuestType.boss,
                        markerLocation: new Types.ObjectId(),
                    },
                    requirements: {
                        ...base.requirements,
                        minTitle: TitleType.hero,
                        requiredAdventurers: [
                            { title: TitleType.hero, count: 3 },
                        ],
                    },
                    concludedAt: null,
                },
            ];
            await quests.collection.insertMany(handWritten);
            const handWrittenFilter = { generated: { $exists: false } };
            const before = await quests.collection
                .find(handWrittenFilter)
                .sort({ _id: 1 })
                .toArray();

            await expect(
                generatorWith({ target: 12 }).generate(),
            ).resolves.toBeGreaterThan(0);

            const after = await quests.collection
                .find(handWrittenFilter)
                .sort({ _id: 1 })
                .toArray();
            expect(before).toHaveLength(2);
            expect(after).toEqual(before);
        });
    });
});

// corsa a seme 7 sul codice di PRIMA del boss misto (HEAD 9f7006d4, generatore non ancora cablato), mondo senza boss
const ENEMY_RUN_BEFORE_MIXED_BOSSES: unknown[] = [
    {
        title: 'Minaccia: 1 Nemico 12 e 1 Nemico 8 presso Città 0',
        type: 'enemy',
        description:
            'Qui parla il capitano della guardia di Città 0. Avvistati 1 Nemico 12 e 1 Nemico 8 nei dintorni: i miei uomini non bastano, servono avventurieri.',
        poi: '0:0',
        enemies: ['Nemico 12x1', 'Nemico 8x1'],
        minTitle: 'rookie',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: ['Spada commonx1', 'Pozione commonx1'],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 1, copper: 50 },
        xpPrize: 40,
        randomLoot: ['Spada commonx1'],
        pet: null,
    },
    {
        title: 'Minaccia: 3 Nemico 8 presso Città 1',
        type: 'enemy',
        description:
            'Le carovane dirette a Città 1 non arrivano più: 3 Nemico 8 assaltano chiunque passi sulla strada. Pagherò bene chi riaprirà la via.',
        poi: '1:0',
        enemies: ['Nemico 8x3'],
        minTitle: 'adventurer',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: [
            'Spada commonx1',
            'Spada uncommonx1',
            'Pozione commonx1',
        ],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 3, copper: 0 },
        xpPrize: 80,
        randomLoot: ['Pane commonx1', 'Spada commonx1'],
        pet: null,
    },
    {
        title: 'Minaccia: 1 Nemico 45, 2 Nemico 8 e 1 Nemico 12 presso Città 2',
        type: 'enemy',
        description:
            'Le carovane dirette a Città 2 non arrivano più: 1 Nemico 45, 2 Nemico 8 e 1 Nemico 12 assaltano chiunque passi sulla strada. Pagherò bene chi riaprirà la via.',
        poi: '2:2',
        enemies: ['Nemico 45x1', 'Nemico 8x2', 'Nemico 12x1'],
        minTitle: 'paladin',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: [
            'Spada commonx1',
            'Spada uncommonx1',
            'Pozione commonx1',
        ],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 7, copper: 50 },
        xpPrize: 200,
        randomLoot: [
            'Pozione uncommonx1',
            'Spada commonx1',
            'Pozione commonx1',
        ],
        pet: null,
    },
    {
        title: 'Minaccia: 1 Nemico 8 e 5 Nemico 45 presso Città 1',
        type: 'enemy',
        description:
            'Qui parla il capitano della guardia di Città 1. Avvistati 1 Nemico 8 e 5 Nemico 45 nei dintorni: i miei uomini non bastano, servono avventurieri.',
        poi: '1:1',
        enemies: ['Nemico 8x1', 'Nemico 45x5'],
        minTitle: 'mage',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: [
            'Spada commonx1',
            'Spada uncommonx1',
            'Pozione commonx1',
        ],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 18, copper: 0 },
        xpPrize: 480,
        randomLoot: ['Pozione rarex1', 'Spada uncommonx1', 'Pane uncommonx1'],
        pet: null,
    },
    {
        title: 'Minaccia: 1 Nemico 8 e 1 Nemico 12 presso Città 3',
        type: 'enemy',
        description:
            'Qui parla il capitano della guardia di Città 3. Avvistati 1 Nemico 8 e 1 Nemico 12 nei dintorni: i miei uomini non bastano, servono avventurieri.',
        poi: '3:2',
        enemies: ['Nemico 8x1', 'Nemico 12x1'],
        minTitle: 'rookie',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: ['Spada commonx1', 'Pozione commonx1'],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 1, copper: 50 },
        xpPrize: 40,
        randomLoot: ['Spada commonx1', 'Pozione commonx1'],
        pet: null,
    },
    {
        title: 'Minaccia: Nemico 30 presso Città 2',
        type: 'enemy',
        description:
            'Sono un contadino di Città 2: Nemico 30 razziano i nostri campi da giorni. Vi supplico, liberateci da questa minaccia prima del raccolto.',
        poi: '2:0',
        enemies: ['Nemico 30x1'],
        minTitle: 'adventurer',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: [
            'Spada commonx1',
            'Spada uncommonx1',
            'Pozione commonx1',
        ],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 3, copper: 0 },
        xpPrize: 80,
        randomLoot: ['Pane commonx1'],
        pet: null,
    },
    {
        title: 'Minaccia: 4 Nemico 22 presso Città 0',
        type: 'enemy',
        description:
            'Le carovane dirette a Città 0 non arrivano più: 4 Nemico 22 assaltano chiunque passi sulla strada. Pagherò bene chi riaprirà la via.',
        poi: '0:1',
        enemies: ['Nemico 22x4'],
        minTitle: 'paladin',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: [
            'Spada commonx1',
            'Spada uncommonx1',
            'Pozione commonx1',
        ],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 7, copper: 50 },
        xpPrize: 200,
        randomLoot: ['Spada uncommonx1', 'Pozione commonx1', 'Pane commonx1'],
        pet: null,
    },
    {
        title: 'Minaccia: 8 Nemico 30 presso Città 3',
        type: 'enemy',
        description:
            'Le carovane dirette a Città 3 non arrivano più: 8 Nemico 30 assaltano chiunque passi sulla strada. Pagherò bene chi riaprirà la via.',
        poi: '3:1',
        enemies: ['Nemico 30x8'],
        minTitle: 'mage',
        seats: [{ title: null, count: 1 }],
        recommendedLoot: [
            'Spada commonx1',
            'Spada uncommonx1',
            'Pozione commonx1',
        ],
        prizeKeys: [
            'cure',
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ],
        prizeCoins: { gold: 0, silver: 18, copper: 0 },
        xpPrize: 480,
        randomLoot: ['Pozione rarex1', 'Pane uncommonx1', 'Spada uncommonx1'],
        pet: null,
    },
];
