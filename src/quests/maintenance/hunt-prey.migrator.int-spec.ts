import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City, CityDocument, CitySchema } from 'src/models/city.model';
import { Enemy, EnemyDocument, EnemySchema } from 'src/models/enemy.model';
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

describe('HuntPreyMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let enemies: Model<EnemyDocument>;
    let lore: Model<LoreDocument>;
    let pois: Model<PointOfInterestDocument>;
    let cities: Model<CityDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
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
        expect(hunt.requirements.recommendedLoot).toEqual(RECOMMENDED_LOOT);
        expect(hunt.prizes).toEqual(PRIZES);
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
                ]),
            ],
        });
        quests = harness.app.get(getModelToken(Quest.name));
        enemies = harness.app.get(getModelToken(Enemy.name));
        lore = harness.app.get(getModelToken(Lore.name));
        pois = harness.app.get(getModelToken(PointOfInterest.name));
        cities = harness.app.get(getModelToken(City.name));
        pendingQuests = harness.app.get(getModelToken(PendingQuest.name));
        migrator = new HuntPreyMigrator(
            quests as never,
            enemies as never,
            lore as never,
            pois as never,
            cities as never,
            pendingQuests as never,
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
