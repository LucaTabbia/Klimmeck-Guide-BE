import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { QuestGenerationConfig } from 'src/config/quest-generation-config';
import { QUEST_GENERATION_CONFIG } from 'src/config/quest-generation-config';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Pet } from 'src/models/pet.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
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
    HERO_BAND_ENEMY_XPS,
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

    it('respects the cap of three generated quests per city (D-15)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 6,
        });
        config.target = 24;

        await expect(generate()).resolves.toBe(12);
        expect(generatedPerCityOf(world, await markersOfGenerated())).toEqual({
            'Città 0': 3,
            'Città 1': 3,
            'Città 2': 3,
            'Città 3': 3,
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
        expect(types).toEqual([QuestType.boss, QuestType.enemy].sort());
        expect(await rawQuests(fixedIds)).toEqual(before);
        expect(await quests.countDocuments({ generated: { $ne: true } })).toBe(
            FIXED_TYPES.length,
        );
    });

    it('spreads the quests over a 30 city map without concentrating them (D-15)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 30,
            poisPerCity: 3,
            grid: 6,
        });

        await expect(generate()).resolves.toBe(30);
        const perCity = Object.values(
            generatedPerCityOf(world, await markersOfGenerated()),
        );
        expect(perCity).toHaveLength(30);
        expect(Math.max(...perCity)).toBeLessThanOrEqual(3);
        expect(perCity.filter((count) => count === 0).length).toBeGreaterThan(
            0,
        );
    });

    it('brings the legend rank into the rotation (D-07)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 4,
            poisPerCity: 3,
        });
        const heroIds = (
            await models.enemies
                .find({
                    _id: { $in: world.enemyIds },
                    xp: { $in: [...HERO_BAND_ENEMY_XPS] },
                })
                .lean<{ _id: Types.ObjectId }[]>()
        ).map((enemy) => enemy._id.toHexString());
        config.target = 12;

        await expect(generate()).resolves.toBe(12);

        const legends = (await generatedQuests()).filter(
            (quest) => quest.requirements.minTitle === TitleType.legend,
        );
        expect(legends.length).toBeGreaterThan(0);
        for (const quest of legends) {
            expect(quest.requirements.requiredAdventurers).toEqual([
                { title: TitleType.legend, count: 1 },
            ]);
            const units = quest.infos.enemies.reduce(
                (sum, entry) => sum + entry.quantity,
                0,
            );
            expect(units).toBeGreaterThanOrEqual(2);
            expect(units).toBeLessThanOrEqual(4);
            expect(
                quest.infos.enemies.filter(
                    (entry) => !heroIds.includes(entry.enemy.toHexString()),
                ),
            ).toEqual([]);
        }
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
