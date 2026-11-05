import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { Enemy, EnemyDocument, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemDocument,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import {
    LootItem,
    LootItemDocument,
    LootItemSchema,
} from 'src/models/loot-item.model';
import { Lore, LoreDocument, LoreSchema } from 'src/models/lore.model';
import {
    PendingQuest,
    PendingQuestDocument,
    PendingQuestSchema,
} from 'src/models/pending-quest.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    buildEquipmentItem,
    buildLootItem,
} from '../../../test/fixtures/catalog-item.fixture';
import { buildCity } from '../../../test/fixtures/city.fixture';
import { buildEnemy } from '../../../test/fixtures/enemy.fixture';
import { buildLore } from '../../../test/fixtures/lore.fixture';
import { buildPoi } from '../../../test/fixtures/poi.fixture';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import { rankOfXp } from './hunt-prey';
import { HuntPreyMigrator } from './hunt-prey.migrator';

interface RawHunt {
    infos: {
        title: string;
        description: string;
        relatedLore: Types.ObjectId[];
        enemies: { enemy: Types.ObjectId; quantity: number }[];
    };
    requirements: { minTitle: string; recommendedLoot: unknown };
    prizes: unknown;
}

const RECOMMENDED_LOOT = [{ item: 'arco', note: 'consigliato' }];
const PRIZES = {
    prizeCoins: { silver: 1 },
    xpPrize: 30,
    prizeItem: null,
    randomLoot: [],
};
// tabella delle enemy a un posto per adventurer: 150 rame e 40 xp × 2
const ADVENTURER_PRIZES = {
    ...PRIZES,
    prizeCoins: { gold: 0, silver: 3, copper: 0 },
    xpPrize: 80,
};

describe('HuntPreyMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let enemies: Model<EnemyDocument>;
    let lore: Model<LoreDocument>;
    let pois: Model<PointOfInterestDocument>;
    let cities: Model<CityDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let equipment: Model<EquipmentItemDocument>;
    let loot: Model<LootItemDocument>;
    let migrator: HuntPreyMigrator;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let bestiary: Types.ObjectId;
    let cityLore: Types.ObjectId;
    let forestPoi: Types.ObjectId;
    let wolf: Types.ObjectId;
    let tiger: Types.ObjectId;
    let scorpion: Types.ObjectId;
    let forestAnimals: Map<string, number>;

    async function insertEnemy(
        name: string,
        xp: number,
        locations: string[],
        animal: boolean,
    ): Promise<Types.ObjectId> {
        const { insertedId } = await enemies.collection.insertOne({
            ...buildEnemy({ name, xp }),
            locations,
            legendary: false,
            relatedLore: animal ? [bestiary] : [],
        });
        return insertedId;
    }

    async function insertPoi(type: string[]): Promise<Types.ObjectId> {
        const { insertedId } = await pois.collection.insertOne(
            buildPoi({ type }),
        );
        return insertedId;
    }

    async function insertCity(
        poi: Types.ObjectId,
        name = 'Bosa',
    ): Promise<void> {
        await cities.collection.insertOne(
            buildCity({
                name,
                relatedLore: cityLore,
                pointsOfInterest: [poi],
            }),
        );
    }

    async function insertHunt(
        prey: Types.ObjectId,
        options: { minTitle?: string; poi?: Types.ObjectId } = {},
    ): Promise<Types.ObjectId> {
        const quest = buildQuest();
        const { insertedId } = await quests.collection.insertOne({
            ...quest,
            infos: {
                ...quest.infos,
                timeToComplete: 3600000,
                title: 'Caccia: vecchia preda',
                type: 'hunt',
                description: 'Vecchia voce del cacciatore.',
                markerLocation: options.poi ?? forestPoi,
                relatedLore: [cityLore],
                enemies: [{ enemy: prey, quantity: 1 }],
            },
            requirements: {
                ...quest.requirements,
                minTitle: options.minTitle ?? 'rookie',
                recommendedLoot: RECOMMENDED_LOOT,
            },
            prizes: PRIZES,
            concludedAt: null,
        });
        return insertedId;
    }

    async function rawHunt(id: Types.ObjectId): Promise<RawHunt> {
        return (await quests.collection.findOne({
            _id: id,
        })) as unknown as RawHunt;
    }

    function expectRedrawn(hunt: RawHunt): void {
        expect(hunt.infos.enemies).toHaveLength(1);
        const [{ enemy, quantity }] = hunt.infos.enemies;
        const xp = forestAnimals.get(enemy.toHexString());
        expect(xp).toBeDefined();
        expect(quantity).toBe(1);
        expect(hunt.requirements.minTitle).toBe(rankOfXp(xp ?? 0));
        const name = enemy.equals(wolf) ? 'Lupo' : 'Tigre';
        expect(hunt.infos.title).toBe(`Caccia: ${name} nei dintorni di Bosa`);
        expect(hunt.infos.description).toBe(
            `Sono un cacciatore di Bosa e da solo non ce la faccio più. Cerco compagni per stanare una preda pericolosa: ${name}.`,
        );
        expect(hunt.infos.relatedLore).toEqual([cityLore, bestiary]);
        const promoted = hunt.requirements.minTitle !== 'rookie';
        expect(hunt.requirements.recommendedLoot).toEqual(
            promoted ? [] : RECOMMENDED_LOOT,
        );
        expect(hunt.prizes).toEqual(promoted ? ADVENTURER_PRIZES : PRIZES);
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: Enemy.name, schema: EnemySchema },
                    { name: Lore.name, schema: LoreSchema },
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                    { name: City.name, schema: CitySchema },
                    { name: PendingQuest.name, schema: PendingQuestSchema },
                    {
                        name: EquipmentItem.name,
                        schema: EquipmentItemSchema,
                    },
                    { name: LootItem.name, schema: LootItemSchema },
                ]),
            ],
        });
        quests = harness.app.get(getModelToken(Quest.name));
        enemies = harness.app.get(getModelToken(Enemy.name));
        lore = harness.app.get(getModelToken(Lore.name));
        pois = harness.app.get(getModelToken(PointOfInterest.name));
        cities = harness.app.get(getModelToken(City.name));
        pendingQuests = harness.app.get(getModelToken(PendingQuest.name));
        equipment = harness.app.get(getModelToken(EquipmentItem.name));
        loot = harness.app.get(getModelToken(LootItem.name));
        migrator = new HuntPreyMigrator(
            quests as never,
            enemies as never,
            lore as never,
            pois as never,
            cities as never,
            pendingQuests as never,
            equipment as never,
            loot as never,
        );
    });

    beforeEach(async () => {
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        ({ insertedId: bestiary } = await lore.collection.insertOne(
            buildLore({ type: 'animal', name: 'Bestiario' }),
        ));
        ({ insertedId: cityLore } = await lore.collection.insertOne(
            buildLore({ type: 'city', name: 'Bosa' }),
        ));
        wolf = await insertEnemy('Lupo', 12, ['forest'], true);
        tiger = await insertEnemy('Tigre', 28, ['forest'], true);
        scorpion = await insertEnemy('Scorpione', 12, ['desert'], true);
        await insertEnemy('Bandito', 12, ['forest'], false);
        forestAnimals = new Map([
            [wolf.toHexString(), 12],
            [tiger.toHexString(), 28],
        ]);
        forestPoi = await insertPoi(['forest']);
        await insertCity(forestPoi);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('redraws the prey of a hunt with a wrong band or an animal out of the zone (D-07)', async () => {
        const wrongBand = await insertHunt(tiger);
        const outOfZone = await insertHunt(scorpion);

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 2,
            coherent: 0,
            withoutPrey: 0,
            inLane: 0,
        });

        expectRedrawn(await rawHunt(wrongBand));
        expectRedrawn(await rawHunt(outOfZone));
        expect(logSpy.mock.calls).toEqual([
            ['Hunt: 2 rifatte, 0 già coerenti, 0 senza prede, 0 in corsia'],
        ]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('leaves a coherent hunt untouched (D-07)', async () => {
        const rookie = await insertHunt(wolf);
        const adventurer = await insertHunt(tiger, { minTitle: 'adventurer' });
        const before = [await rawHunt(rookie), await rawHunt(adventurer)];

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 0,
            coherent: 2,
            withoutPrey: 0,
            inLane: 0,
        });

        expect([await rawHunt(rookie), await rawHunt(adventurer)]).toEqual(
            before,
        );
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('leaves a hunt without animals in its zone and warns with its id (D-07)', async () => {
        const mountain = await insertPoi(['mountain']);
        await insertCity(mountain, 'Kliever');
        const hunt = await insertHunt(tiger, { poi: mountain });
        const before = await rawHunt(hunt);

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 0,
            coherent: 0,
            withoutPrey: 1,
            inLane: 0,
        });

        expect(await rawHunt(hunt)).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [`Hunt ${hunt.toHexString()} senza prede in zona: lasciata`],
        ]);
        expect(logSpy.mock.calls).toEqual([
            ['Hunt: 0 rifatte, 0 già coerenti, 1 senza prede, 0 in corsia'],
        ]);
    });

    it('counts a coherent hunt whose poi has no city as coherent (D-07)', async () => {
        const orphanPoi = await insertPoi(['forest']);
        const coherent = await insertHunt(wolf, { poi: orphanPoi });
        const incoherent = await insertHunt(tiger, { poi: orphanPoi });
        const before = await rawHunt(coherent);

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 0,
            coherent: 1,
            withoutPrey: 1,
            inLane: 0,
        });

        expect(await rawHunt(coherent)).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [`Hunt ${incoherent.toHexString()} senza prede in zona: lasciata`],
        ]);
    });

    it('leaves a hunt held in a lane and warns with its id (D-07)', async () => {
        const hunt = await insertHunt(tiger);
        await pendingQuests.collection.insertOne({
            startDate: null,
            arrivedAt: null,
            waitingTime: 0,
            pointsSpent: 0,
            quest: hunt.toHexString(),
        });
        const before = await rawHunt(hunt);

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 0,
            coherent: 0,
            withoutPrey: 0,
            inLane: 1,
        });

        expect(await rawHunt(hunt)).toEqual(before);
        expect(warnSpy.mock.calls).toEqual([
            [`Hunt ${hunt.toHexString()} in corsia: lasciata`],
        ]);
        expect(logSpy.mock.calls).toEqual([
            ['Hunt: 0 rifatte, 0 già coerenti, 0 senza prede, 1 in corsia'],
        ]);
    });

    it('rewrites the prizes and the recommended loot of a hunt promoted to another band (D-07)', async () => {
        const swamp = await insertPoi(['swamp']);
        await insertCity(swamp);
        const { insertedId: crocodile } = await enemies.collection.insertOne({
            ...buildEnemy({ name: 'Coccodrillo', xp: 28 }),
            locations: ['swamp'],
            legendary: false,
            relatedLore: [bestiary],
            baseWeaknesses: ['piercing'],
        });
        const { insertedId: spear } = await equipment.collection.insertOne(
            buildEquipmentItem({
                name: 'Lancia',
                damages: { base: [{ type: 'piercing', power: 3 }], energy: [] },
            }),
        );
        await loot.collection.insertOne(
            buildLootItem({ name: 'Erba', rarity: 'common', power: 5 }),
        );
        const { insertedId: tonic } = await loot.collection.insertOne(
            buildLootItem({ name: 'Tonico', rarity: 'uncommon', power: 10 }),
        );
        await loot.collection.insertOne(
            buildLootItem({ name: 'Elisir', rarity: 'rare', power: 50 }),
        );
        const hunt = await insertHunt(wolf, { poi: swamp });

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 1,
            coherent: 0,
            withoutPrey: 0,
            inLane: 0,
        });

        const after = await rawHunt(hunt);
        expect(after.infos.enemies).toEqual([
            { enemy: crocodile, quantity: 1 },
        ]);
        expect(after.requirements.minTitle).toBe('adventurer');
        expect(after.prizes).toEqual(ADVENTURER_PRIZES);
        expect(after.requirements.recommendedLoot).toEqual([
            { itemType: 'EquipmentItem', item: spear, quantity: 1 },
            { itemType: 'LootItem', item: tonic, quantity: 1 },
        ]);
    });

    it('keeps the prizes and the recommended loot of a hunt redrawn in its band (D-07)', async () => {
        const marsh = await insertPoi(['marsh']);
        await insertCity(marsh);
        const { insertedId: frog } = await enemies.collection.insertOne({
            ...buildEnemy({ name: 'Rana', xp: 5 }),
            locations: ['marsh'],
            legendary: false,
            relatedLore: [bestiary],
        });
        await loot.collection.insertOne(
            buildLootItem({ name: 'Erba', rarity: 'common', power: 5 }),
        );
        const hunt = await insertHunt(scorpion, { poi: marsh });

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 1,
            coherent: 0,
            withoutPrey: 0,
            inLane: 0,
        });

        const after = await rawHunt(hunt);
        expect(after.infos.enemies).toEqual([{ enemy: frog, quantity: 1 }]);
        expect(after.requirements.minTitle).toBe('rookie');
        expect(after.prizes).toEqual(PRIZES);
        expect(after.requirements.recommendedLoot).toEqual(RECOMMENDED_LOOT);
    });

    it('writes nothing on the second run (D-07)', async () => {
        const wrongBand = await insertHunt(tiger);
        const outOfZone = await insertHunt(scorpion);
        await migrator.migrate();
        const after = [await rawHunt(wrongBand), await rawHunt(outOfZone)];
        logSpy.mockClear();

        await expect(migrator.migrate()).resolves.toEqual({
            redrawn: 0,
            coherent: 2,
            withoutPrey: 0,
            inLane: 0,
        });

        expect([await rawHunt(wrongBand), await rawHunt(outOfZone)]).toEqual(
            after,
        );
        expect(logSpy).not.toHaveBeenCalled();
    });
});
