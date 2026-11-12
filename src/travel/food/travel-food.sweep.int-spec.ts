import { getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PUSH_CONFIG } from 'src/config/push-config';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { LootItem } from 'src/models/loot-item.model';
import { PushTransport } from 'src/push/transport/push-transport';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { TRAVEL_QUEUE } from '../travel-job';
import { TravelSweeper } from '../travel-sweeper';
import { TravelModule } from '../travel.module';
import {
    MALFORMED_PLAN_WARNINGS_KEPT,
    TravelFoodSweep,
} from './travel-food.sweep';
import { TravelPantryReader } from './travel-pantry.reader';
import { AuthTestApp } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import {
    buildCharacter,
    persistCharacter,
    persistLootItem,
} from '../../../test/fixtures';
import { FakePushTransport } from '../../../test/push/fake-push-transport';
import { buildFoodTravelDoc } from '../../../test/travel/active-travel.fixture';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    foodStack,
    persistFood,
} from '../../../test/travel/travel-food.fixture';

const START = new Date('2026-10-21T08:00:00.000Z');
const EATEN_AT = new Date('2026-10-21T08:30:00.000Z');
const LIFE = 1_000;
const MS_PER_SECOND = 1_000;
const AFTER_MEAL = { settledKm: 10, foodConsumedAt: EATEN_AT };

const at = (time: string): Date => new Date(`2026-10-21T${time}:00.000Z`);

describe('TravelFoodSweep (replSet)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let lootItems: Model<LootItem>;
    let pantry: TravelPantryReader;
    let clock: FixedClock;
    let seq = 0;
    const overrides = [
        { token: PushTransport, useValue: new FakePushTransport() },
        { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
        { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
        { token: getQueueToken(TRAVEL_QUEUE), useValue: new FakeTravelQueue() },
        {
            token: getQueueToken(QUEST_RESOLUTION_QUEUE),
            useValue: new FakeTravelQueue(),
        },
    ];

    beforeAll(async () => {
        clock = new FixedClock(START);
        harness = await createCharactersTestApp({
            clock,
            imports: [TravelModule],
            overrides,
        });
        characters = harness.app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        lootItems = harness.app.get<Model<LootItem>>(
            getModelToken(LootItem.name),
        );
        pantry = harness.app.get(TravelPantryReader);
        // collection pronte prima delle transazioni multi-documento (Pitfall 5)
        await Promise.all([characters.init(), lootItems.init()]);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        moveClockTo(START);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.close();
    });

    function moveClockTo(target: Date): void {
        clock.advanceSeconds(
            (target.getTime() - clock.now().getTime()) / MS_PER_SECOND,
        );
    }

    function sweep(time: string): Promise<number> {
        moveClockTo(at(time));
        return harness.app.get(TravelFoodSweep).settleDue(clock.now());
    }

    // fixture inserite solo dentro i test: il reconciler al boot gira comunque (Pitfall 7)
    async function foodTraveller({
        lifePoints = LIFE,
        maxLifePoints = LIFE,
        ownedItems = [] as unknown[],
        food = {} as Record<string, unknown> | null,
        travel = {} as Record<string, unknown>,
    } = {}): Promise<Types.ObjectId> {
        seq += 1;
        const character = await persistCharacter(characters, {
            infos: { ...buildCharacter().infos, name: `Affamato ${seq}` },
            status: {
                ...buildCharacter().status,
                location: new Types.ObjectId(),
                activeTravel: buildFoodTravelDoc(food, travel),
                currentLifePoints: lifePoints,
                maxLifePoints,
            },
            assets: { ...buildCharacter().assets, ownedItems },
        });
        return character._id as Types.ObjectId;
    }

    async function tenFoodUnits() {
        return [foodStack(await persistFood(lootItems, 1), 10)];
    }

    function rawCharacter(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    it('writes nothing inside the covered stretch (D-01, D-15)', async () => {
        const id = await foodTraveller({ ownedItems: await tenFoodUnits() });
        const before = await rawCharacter(id);

        await expect(sweep('08:15')).resolves.toBe(0);

        expect(await rawCharacter(id)).toEqual(before);
    });

    it('eats the whole plan once at the end of the covered kilometres (D-03)', async () => {
        const id = await foodTraveller({ ownedItems: await tenFoodUnits() });

        await expect(sweep('08:30')).resolves.toBe(1);

        const raw = await rawCharacter(id);
        expect(raw?.assets.ownedItems).toEqual([]);
        expect(raw?.status.activeTravel.food.foodConsumedAt).toEqual(
            at('08:30'),
        );
        expect(raw?.status.activeTravel.food.settledKm).toBe(10);
        expect(raw?.status.currentLifePoints).toBe(LIFE);

        await expect(sweep('08:31')).resolves.toBe(0);
        expect(await rawCharacter(id)).toEqual(raw);
    });

    it('charges the hunger of the kilometres walked since the last sweep (D-01, D-02)', async () => {
        const id = await foodTraveller({ food: AFTER_MEAL });

        await expect(sweep('08:33')).resolves.toBe(1);
        let raw = await rawCharacter(id);
        expect(raw?.status.currentLifePoints).toBe(999);
        expect(raw?.status.activeTravel.food.settledKm).toBe(11);

        await expect(sweep('08:39')).resolves.toBe(1);
        raw = await rawCharacter(id);
        expect(raw?.status.currentLifePoints).toBe(994);
        expect(raw?.status.activeTravel.food.settledKm).toBe(13);
    });

    it('keeps a potion drunk between two sweeps (D-09)', async () => {
        const id = await foodTraveller({ food: AFTER_MEAL });
        await sweep('08:33');
        await characters.collection.updateOne(
            { _id: id },
            { $set: { 'status.currentLifePoints': 1099 } },
        );

        await sweep('08:39');

        expect((await rawCharacter(id))?.status.currentLifePoints).toBe(1094);
    });

    it('charges the same kilometres once under repeated and concurrent sweeps (D-14)', async () => {
        const id = await foodTraveller({ food: AFTER_MEAL });
        moveClockTo(at('08:39'));
        const foodSweep = harness.app.get(TravelFoodSweep);

        await Promise.all([
            foodSweep.settleDue(clock.now()),
            foodSweep.settleDue(clock.now()),
        ]);
        await foodSweep.settleDue(clock.now());

        const raw = await rawCharacter(id);
        expect(raw?.status.currentLifePoints).toBe(994);
        expect(raw?.status.activeTravel.food.settledKm).toBe(13);
    });

    it('stops the hunger at a pending ambush kilometre (D-16)', async () => {
        const id = await foodTraveller({
            food: AFTER_MEAL,
            travel: { ambush: { at: at('08:36'), km: 12, attempts: 0 } },
        });

        await sweep('08:45');

        const raw = await rawCharacter(id);
        expect(raw?.status.activeTravel.food.settledKm).toBe(12);
        expect(raw?.status.currentLifePoints).toBe(997);
    });

    it('never lowers the life under one (D-01)', async () => {
        const id = await foodTraveller({ lifePoints: 2, food: AFTER_MEAL });

        await sweep('08:45');

        expect((await rawCharacter(id))?.status.currentLifePoints).toBe(1);
    });

    it('ignores a legacy travel without a food plan (D-11)', async () => {
        const id = await foodTraveller({
            food: null,
            ownedItems: await tenFoodUnits(),
        });
        const before = await rawCharacter(id);

        await expect(sweep('08:45')).resolves.toBe(0);

        const raw = await rawCharacter(id);
        expect(raw).toEqual(before);
        expect(Object.keys(raw?.status.activeTravel).sort()).toEqual(
            Object.keys(before?.status.activeTravel).sort(),
        );
        expect(Object.keys(raw?.status.activeTravel)).not.toContain('food');
    });

    it('skips a malformed food plan with a warning carrying only the id (D-11)', async () => {
        const id = await foodTraveller({ food: AFTER_MEAL });
        await characters.collection.updateOne(
            { _id: id },
            { $set: { 'status.activeTravel.food.hpLostTotal': 54 } },
        );
        const before = await rawCharacter(id);
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        await expect(sweep('08:45')).resolves.toBe(0);

        expect(await rawCharacter(id)).toEqual(before);
        expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
            `Viaggio del personaggio ${id.toHexString()}: piano del cibo non valido, ignorato`,
        ]);
    });

    it('warns about a malformed food plan once per travel (D-11, D-15)', async () => {
        const id = await foodTraveller({ food: AFTER_MEAL });
        await characters.collection.updateOne(
            { _id: id },
            { $set: { 'status.activeTravel.food.hpLostTotal': 54 } },
        );
        const before = await rawCharacter(id);
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        await expect(sweep('08:45')).resolves.toBe(0);
        await expect(sweep('08:46')).resolves.toBe(0);

        expect(await rawCharacter(id)).toEqual(before);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('forgets the warned travels past the memory bound (D-15)', async () => {
        const malformed = () => ({
            _id: new Types.ObjectId(),
            status: { activeTravel: buildFoodTravelDoc({ hpLostTotal: 54 }) },
        });
        const crowd = Array.from(
            { length: MALFORMED_PLAN_WARNINGS_KEPT + 1 },
            malformed,
        );
        const find = jest.spyOn(characters, 'find');
        const travellersOf = (travellers: unknown[]) =>
            ({
                lean: () => ({ exec: () => Promise.resolve(travellers) }),
            }) as unknown as ReturnType<typeof characters.find>;
        find.mockReturnValueOnce(travellersOf(crowd));
        find.mockReturnValueOnce(travellersOf([crowd[0]]));
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        await sweep('08:45');
        await sweep('08:46');

        expect(warn).toHaveBeenCalledTimes(MALFORMED_PLAN_WARNINGS_KEPT + 2);
    });

    it('skips a travel whose start is not a date and still settles the others (D-11, D-15)', async () => {
        const broken = await foodTraveller({
            ownedItems: await tenFoodUnits(),
        });
        const healthy = await foodTraveller({
            ownedItems: await tenFoodUnits(),
        });
        await characters.collection.updateOne(
            { _id: broken },
            { $set: { 'status.activeTravel.startTime': START.toISOString() } },
        );
        const before = await rawCharacter(broken);
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweep('08:30')).resolves.toBe(1);

        expect(await rawCharacter(broken)).toEqual(before);
        expect((await rawCharacter(healthy))?.assets.ownedItems).toEqual([]);
        expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
            `Viaggio del personaggio ${broken.toHexString()}: piano del cibo non valido, ignorato`,
        ]);
    });

    it('rewrites the curve when the pantry covers less than the plan (D-19)', async () => {
        const food = await persistFood(lootItems, 1);
        const id = await foodTraveller({ ownedItems: [foodStack(food, 4)] });
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        await expect(sweep('08:30')).resolves.toBe(1);

        const raw = await rawCharacter(id);
        expect(raw?.assets.ownedItems).toEqual([]);
        expect(raw?.status.activeTravel.food).toEqual(
            expect.objectContaining({
                uncoveredKm: 16,
                coveredKm: 4,
                hpLostTotal: 136,
                settledKm: 10,
            }),
        );
        expect(raw?.status.currentLifePoints).toBe(979);
        expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
            `Viaggio del personaggio ${id.toHexString()}: cibo cambiato al confine, km scoperti 10 → 16`,
        ]);
    });

    it('keeps a pantry change made after the read of the boundary meal (D-14)', async () => {
        const potion = await persistLootItem(lootItems, {
            name: 'Pozione di prova',
        });
        const id = await foodTraveller({ ownedItems: await tenFoodUnits() });
        const original = pantry.read.bind(pantry);
        let purchased = false;
        const read = jest
            .spyOn(pantry, 'read')
            .mockImplementation(async (characterId, session) => {
                const read = await original(characterId, session);
                if (!purchased) {
                    purchased = true;
                    await characters.updateOne(
                        { _id: characterId },
                        {
                            $push: {
                                'assets.ownedItems': foodStack(potion, 1),
                            },
                        },
                    );
                }
                return read;
            });

        await expect(sweep('08:30')).resolves.toBe(1);

        expect((await rawCharacter(id))?.assets.ownedItems).toEqual([
            foodStack(potion, 1),
        ]);
        expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('settles the hunger from the travel sweep (D-15)', async () => {
        const id = await foodTraveller({ ownedItems: await tenFoodUnits() });
        moveClockTo(at('08:30'));

        await expect(harness.app.get(TravelSweeper).sweep()).resolves.toBe(0);

        expect((await rawCharacter(id))?.assets.ownedItems).toEqual([]);
    });

    it('isolates a failing traveller and logs only its id and error code (D-15)', async () => {
        const failing = await foodTraveller({
            ownedItems: await tenFoodUnits(),
        });
        const healthy = await foodTraveller({
            ownedItems: await tenFoodUnits(),
        });
        const original = pantry.read.bind(pantry);
        jest.spyOn(pantry, 'read').mockImplementation((characterId, session) =>
            characterId.equals(failing)
                ? Promise.reject(new Error('raw driver message'))
                : original(characterId, session),
        );
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation();
        jest.spyOn(Logger.prototype, 'log').mockImplementation();

        await expect(sweep('08:30')).resolves.toBe(1);

        expect((await rawCharacter(healthy))?.assets.ownedItems).toEqual([]);
        expect(error.mock.calls.map(([message]) => String(message))).toEqual([
            `Fame del viaggio del personaggio ${failing.toHexString()} fallita: Error`,
        ]);
    });
});
