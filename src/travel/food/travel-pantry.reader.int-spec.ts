import { getQueueToken } from '@nestjs/bull';
import { INestApplication } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { Clock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { LootItem } from 'src/models/loot-item.model';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { TRAVEL_QUEUE } from '../travel-job';
import { TravelPlanningModule } from '../travel-planning.module';
import { stacksOf, TravelPantryReader } from './travel-pantry.reader';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildCharacter,
    persistCharacter,
    persistLootItem,
} from '../../../test/fixtures';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    foodStack,
    persistFood,
} from '../../../test/travel/travel-food.fixture';

const READ_AT = new Date('2026-11-05T10:00:00.000Z');
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');
const QUEUE_TIMEOUT_MS = 50;
const LEG = { duration: 9_900_000, road: { coordinates: [], distance: 16 } };

describe('TravelPantryReader (replSet)', () => {
    let app: INestApplication;
    let reader: TravelPantryReader;
    let connection: Connection;
    let characters: Model<CharacterDocument>;
    let lootItems: Model<any>;
    const queue = new FakeTravelQueue();
    const questQueue = new FakeTravelQueue();

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'travel-pantry-test',
                }),
                TravelPlanningModule,
            ],
        })
            .overrideProvider(getQueueToken(TRAVEL_QUEUE))
            .useValue(queue)
            .overrideProvider(getQueueToken(QUEST_RESOLUTION_QUEUE))
            .useValue(questQueue)
            .overrideProvider(Clock)
            .useValue(new FixedClock(READ_AT))
            .overrideProvider(QUEUE_CALL_TIMEOUT)
            .useValue(QUEUE_TIMEOUT_MS)
            .compile();
        app = moduleRef.createNestApplication();
        await app.init();
        reader = app.get(TravelPantryReader);
        connection = app.get<Connection>(getConnectionToken());
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        lootItems = app.get<Model<any>>(getModelToken(LootItem.name));
    });

    beforeEach(async () => {
        await Promise.all([
            characters.deleteMany({}),
            lootItems.deleteMany({}),
        ]);
    });

    afterAll(async () => {
        await connection.dropDatabase();
        await app.close();
    });

    async function traveller(
        overrides: Record<string, any> = {},
    ): Promise<Types.ObjectId> {
        const base = buildCharacter();
        const character = await persistCharacter(characters, {
            ...overrides,
            status: { ...base.status, ...overrides.status },
            assets: { ...base.assets, ...overrides.assets },
        });
        return character._id as Types.ObjectId;
    }

    function idOf(document: { _id: unknown }): Types.ObjectId {
        return document._id as Types.ObjectId;
    }

    it('reads the hunger stacks in the order of the owned items with power and sell value (D-06, D-17)', async () => {
        const food50 = await persistFood(lootItems, 50, {
            sellPrice: { silver: 1, copper: 5 },
        });
        const potion = await persistLootItem(lootItems);
        const food20 = await persistFood(lootItems, 20);
        const id = await traveller();
        await characters.collection.updateOne(
            { _id: id },
            {
                $set: {
                    'assets.ownedItems': [
                        foodStack(food50, 1),
                        foodStack(potion, 2),
                        {
                            itemType: 'LootItem',
                            item: idOf(food20).toHexString(),
                            quantity: 3,
                        },
                    ],
                },
            },
        );

        const pantry = await reader.read(id);

        expect(pantry.stacks).toEqual([
            { itemId: idOf(food50), power: 50, sellCopper: 105, quantity: 1 },
            { itemId: idOf(food20), power: 20, sellCopper: 10, quantity: 3 },
        ]);
        expect(pantry.stacks[1].itemId).toBeInstanceOf(Types.ObjectId);
        expect(pantry.assets.ownedItems).toHaveLength(3);
    });

    it('reads the life points before the travel, legacy ones from the maximum (D-04)', async () => {
        const base = buildCharacter();
        const id = await traveller({
            status: { ...base.status, currentLifePoints: 40 },
        });

        const wounded = await reader.read(id);
        expect([wounded.hpRaw, wounded.hpBefore]).toEqual([40, 40]);

        await characters.collection.updateOne(
            { _id: id },
            { $unset: { 'status.currentLifePoints': '' } },
        );
        const legacy = await reader.read(id);
        expect(legacy.hpRaw).toBeUndefined();
        expect(legacy.hpBefore).toBe(100);
    });

    it('answers NOT_FOUND for a missing or archived character (D-08)', async () => {
        const archived = await traveller({ deletedAt: ARCHIVED_AT });

        await expect(reader.read(new Types.ObjectId())).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        await expect(reader.read(archived)).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
    });

    it('reads inside the session of a transaction (D-12)', async () => {
        const food20 = await persistFood(lootItems, 20);
        const id = await traveller();
        let inside: unknown;
        let outside: unknown;

        await connection.transaction(async (session) => {
            await characters.updateOne(
                { _id: id },
                { $push: { 'assets.ownedItems': foodStack(food20, 1) } },
                { session },
            );
            inside = (await reader.read(id, session)).stacks;
            outside = (await reader.read(id)).stacks;
        });

        expect(inside).toEqual([
            { itemId: idOf(food20), power: 20, sellCopper: 10, quantity: 1 },
        ]);
        expect(outside).toEqual([]);
    });

    it('plans the meal of a travel from the pantry (D-01, D-04)', async () => {
        const food20 = await persistFood(lootItems, 20);
        const id = await traveller({
            assets: { ownedItems: [foodStack(food20, 2)] },
        });

        const plan = await reader.planFor(id, LEG);

        expect(plan).toEqual({
            consumed: [{ itemId: idOf(food20), quantity: 2 }],
            needed: 55,
            covered: 40,
            uncoveredKm: 5,
            hpLost: 15,
            hpAfter: 85,
            arrivesAlive: true,
        });
    });
    it('skips a food without catalog document (D-09)', async () => {
        const food20 = await persistFood(lootItems, 20);
        const orphan = new Types.ObjectId();
        const id = await traveller({
            assets: {
                ownedItems: [
                    foodStack(food20, 2),
                    { itemType: 'LootItem', item: orphan, quantity: 3 },
                ],
            },
        });

        const pantry = await reader.read(id);

        expect(pantry.stacks).toEqual([
            { itemId: idOf(food20), power: 20, sellCopper: 10, quantity: 2 },
        ]);
        expect(
            await reader.foodItemsOf([{ itemId: orphan, quantity: 1 }]),
        ).toEqual([]);
    });

    it('reads a legacy character without owned items as an empty pantry (D-09)', async () => {
        const id = await traveller();
        await characters.collection.updateOne(
            { _id: id },
            { $unset: { 'assets.ownedItems': '' } },
        );

        const pantry = await reader.read(id);
        const preview = await reader.previewOf(id, LEG);

        expect(pantry.stacks).toEqual([]);
        expect(pantry.assets.ownedItems).toEqual([]);
        expect(preview.food).toEqual([]);
    });

    it('hydrates the eaten food as LootItem documents with their id (D-09)', async () => {
        const food20 = await persistFood(lootItems, 20);
        const food50 = await persistFood(lootItems, 50);

        const items = await reader.foodItemsOf([
            { itemId: idOf(food20), quantity: 2 },
            { itemId: idOf(food50), quantity: 1 },
        ]);

        expect(
            items.map(({ item, quantity }) => ({
                id: item.id,
                name: item.name,
                quantity,
            })),
        ).toEqual([
            { id: idOf(food20).toHexString(), name: 'Cibo 20', quantity: 2 },
            { id: idOf(food50).toHexString(), name: 'Cibo 50', quantity: 1 },
        ]);
        expect(await reader.foodItemsOf([])).toEqual([]);
    });

    it('reads the food catalogue of the owned items for the ambush and the teleport (D-15)', async () => {
        const food1 = await persistFood(lootItems, 1);
        const potion = await persistLootItem(lootItems);
        const id = await traveller({
            assets: {
                ownedItems: [foodStack(food1, 2), foodStack(potion, 1)],
            },
        });
        const { assets, stacks } = await reader.read(id);
        const ownedItems = assets.ownedItems ?? [];

        const catalogue = await reader.foodCatalogFor(ownedItems);

        expect(
            catalogue.map((food) => ({ id: idOf(food), power: food.power })),
        ).toEqual([{ id: idOf(food1), power: 1 }]);
        expect(stacksOf(ownedItems, catalogue)).toEqual(stacks);
    });
});
