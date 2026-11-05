import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { QUEST_GENERATION_CONFIG } from 'src/config/quest-generation-config';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { CitySize } from 'src/models/enums/city-size.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Lore } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
import { capOf } from 'src/quests/generation/city-picker';
import { QuestGenerationModule } from 'src/quests/generation/quest-generation.module';
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { QuestsModule } from 'src/quests/quests.module';
import { AuthzModule } from 'src/authz/authz.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../auth/auth-test-app';
import { createPlayer } from '../authz/player-fixture';
import { buildQuest, persistQuest } from '../fixtures';
import {
    generatedPerCityOf,
    GenerationModels,
    GenerationWorld,
    persistGenerationWorld,
    QUIET_GENERATION_OVERRIDES,
} from './generation-world';

const SEED = 7;
const GENERATE = 'mutation { generateQuests { created } }';
const BOARD =
    'query { quests { id infos { type enemies { quantity enemy { id } } } } }';
const FIXED_TYPES = [QuestType.hunt, QuestType.dungeon, QuestType.job];

interface LeanGenerated {
    _id: Types.ObjectId;
    infos: {
        type: string;
        markerLocation: Types.ObjectId;
        enemies: { enemy: Types.ObjectId; quantity: number }[];
    };
    requirements: {
        minTitle: string;
        requiredAdventurers: { title: string | null; count: number }[];
    };
    concludedAt?: Date | null;
}

interface WireBoardQuest {
    id: string;
    infos: {
        type: string;
        enemies: { quantity: number; enemy: { id: string } }[];
    };
}

describe('quest generation end to end (replSet)', () => {
    let harness: AuthTestApp;
    let models: GenerationModels;
    let quests: Model<any>;
    let innkeeper: string;
    let seq = 0;
    const config: QuestGenerationConfig = { sweepIntervalMs: 0, target: null };

    const modelOf = (name: string) =>
        harness.app.get<Model<any>>(getModelToken(name));

    async function generate(): Promise<number> {
        const response = await graphqlRequest(
            harness.app,
            GENERATE,
            undefined,
            innkeeper,
        );
        const body = response.body as {
            data?: { generateQuests?: { created: number } } | null;
            errors?: unknown[];
        };
        expect(body.errors).toBeUndefined();
        return body.data?.generateQuests?.created ?? -1;
    }

    async function generatedQuests(): Promise<LeanGenerated[]> {
        return quests
            .find({ generated: true })
            .sort({ _id: 1 })
            .lean<LeanGenerated[]>();
    }

    async function markersOfGenerated(): Promise<Types.ObjectId[]> {
        return (await generatedQuests()).map(
            (quest) => quest.infos.markerLocation,
        );
    }

    // una hunt, una dungeon e una job aperte sul primo POI delle prime tre città
    async function persistFixedQuests(
        world: GenerationWorld,
    ): Promise<Types.ObjectId[]> {
        const ids: Types.ObjectId[] = [];
        for (const [index, type] of FIXED_TYPES.entries()) {
            const base = buildQuest();
            const quest = await persistQuest(quests, {
                infos: {
                    ...base.infos,
                    type,
                    markerLocation: world.cities[index].poiIds[0],
                },
            });
            ids.push(quest._id as Types.ObjectId);
        }
        return ids;
    }

    async function rawQuests(ids: readonly Types.ObjectId[]) {
        return quests.collection
            .find({ _id: { $in: [...ids] } })
            .sort({ _id: 1 })
            .toArray();
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestGenerationModule, QuestsModule, AuthzModule],
            overrides: [
                ...QUIET_GENERATION_OVERRIDES,
                { token: QUEST_GENERATION_CONFIG, useValue: config },
                {
                    token: ChanceSource,
                    useValue: new SeededChanceSource(SEED),
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

    beforeEach(async () => {
        config.target = null;
        seq += 1;
        innkeeper = (
            await createPlayer(harness, {
                twitchId: `tw-e2e-innkeeper-${seq}`,
                role: RoleType.innkeeper,
                withCharacter: false,
            })
        ).bearer;
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('caps every capital at four generated quests (D-04)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 6,
        });
        config.target = 24;

        await expect(generate()).resolves.toBe(16);
        expect(generatedPerCityOf(world, await markersOfGenerated())).toEqual({
            'Città 0': 4,
            'Città 1': 4,
            'Città 2': 4,
            'Città 3': 4,
        });
    });

    it('respects the size caps of villages, cities and capitals (D-04)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 6,
            sizes: [
                CitySize.village,
                CitySize.city,
                CitySize.capital,
                CitySize.capital,
            ],
        });
        config.target = 24;

        await expect(generate()).resolves.toBe(11);
        expect(generatedPerCityOf(world, await markersOfGenerated())).toEqual({
            'Città 0': 1,
            'Città 1': 2,
            'Città 2': 4,
            'Città 3': 4,
        });
    });

    it('never places a generated quest on a city marker or on an occupied poi (D-15)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
        });
        await persistFixedQuests(world);
        config.target = 12;

        const created = await generate();

        const markers = await markersOfGenerated();
        expect(markers).toHaveLength(created);
        const forbidden = [
            ...world.cities.map((city) => city.markerId.toHexString()),
            ...world.cities
                .slice(0, FIXED_TYPES.length)
                .map((city) => city.poiIds[0].toHexString()),
        ];
        const used = markers.map((marker) => marker.toHexString());
        expect(used.filter((id) => forbidden.includes(id))).toEqual([]);
        expect(new Set(used).size).toBe(used.length);
        expect(created).toBe(9);
    });

    it('generates only enemy and boss quests and leaves the fixed ones untouched (D-03)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
        });
        const fixedIds = await persistFixedQuests(world);
        const before = await rawQuests(fixedIds);
        config.target = 12;

        expect(await generate()).toBeGreaterThan(0);

        const types = [
            ...new Set((await generatedQuests()).map((q) => q.infos.type)),
        ].sort();
        // il seme è condiviso fra i casi: il boss dipende dai tiri dei casi precedenti
        const generatedTypes: string[] = [QuestType.boss, QuestType.enemy];
        expect(types.filter((type) => !generatedTypes.includes(type))).toEqual(
            [],
        );
        expect(types).toContain(QuestType.enemy);
        expect(await rawQuests(fixedIds)).toEqual(before);
        expect(await quests.countDocuments({ generated: { $ne: true } })).toBe(
            FIXED_TYPES.length,
        );
    });

    it('spreads the quests over a 30 city map without concentrating them (D-04)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 30,
            poisPerCity: 3,
            grid: 6,
            sizes: [CitySize.village, CitySize.city, CitySize.capital],
        });

        await expect(generate()).resolves.toBe(30);
        const counts = generatedPerCityOf(world, await markersOfGenerated());
        const perCity = Object.values(counts);
        expect(perCity).toHaveLength(30);
        expect(
            world.cities.filter(
                (city) => counts[city.name] > Math.min(capOf(city.size), 3),
            ),
        ).toEqual([]);
        expect(perCity.filter((count) => count === 0).length).toBeGreaterThan(
            0,
        );
    });

    it('never generates a legend quest, the hero rank serves the legends (D-02)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        config.target = 12;

        await expect(generate()).resolves.toBe(12);

        const created = await generatedQuests();
        expect(
            created.filter(
                (quest) => quest.requirements.minTitle === TitleType.legend,
            ),
        ).toEqual([]);
        expect(
            created.filter(
                (quest) => quest.requirements.minTitle === TitleType.hero,
            ).length,
        ).toBeGreaterThan(0);
    });

    it('creates nothing on a second run once the world is full (D-16)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        config.target = 12;
        await expect(generate()).resolves.toBe(12);
        const before = await quests.countDocuments();

        await expect(generate()).resolves.toBe(0);
        expect(await quests.countDocuments()).toBe(before);
    });

    it('keeps generated quests on the board with no expiry (D-14)', async () => {
        await persistGenerationWorld(models, { cities: 3, poisPerCity: 2 });
        const created = await generate();
        const response = await graphqlRequest(
            harness.app,
            BOARD,
            undefined,
            innkeeper,
        );
        const body = response.body as {
            data?: { quests?: WireBoardQuest[] } | null;
            errors?: unknown[];
        };

        expect(body.errors).toBeUndefined();
        const generated = await generatedQuests();
        expect(generated).toHaveLength(created);
        expect(generated.map((quest) => quest.concludedAt ?? null)).toEqual(
            generated.map(() => null),
        );
        const board = body.data?.quests ?? [];
        expect(board.map((quest) => quest.id).sort()).toEqual(
            generated.map((quest) => quest._id.toHexString()).sort(),
        );
        for (const quest of board) {
            expect([QuestType.enemy, QuestType.boss]).toContain(
                quest.infos.type,
            );
            expect(quest.infos.enemies.length).toBeGreaterThan(0);
            for (const entry of quest.infos.enemies) {
                expect(entry.quantity).toBeGreaterThan(0);
                expect(typeof entry.enemy.id).toBe('string');
            }
        }
    });
});
