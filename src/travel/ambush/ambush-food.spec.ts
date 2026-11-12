import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    ambushFoodOf,
    defeatSettlementOf,
    withFoodSettlement,
} from './ambush-food';
import type { AmbushCharacterSnapshot } from './ambush-plan';

const CHARACTER_ID = new Types.ObjectId('64b0000000000000000000d1');
const TO_ID = new Types.ObjectId('64b0000000000000000000d2');
const F20 = new Types.ObjectId('64b000000000000000000020');
const catalog = [{ _id: F20, power: 20 }];

const ROAD_KM = 400;
const DURATION = 144_000_000;
const START = new Date('2026-11-12T00:00:00.000Z');
const END = new Date(START.getTime() + DURATION);
const TEN_HOURS = 10 * 3_600_000;
const EATEN_AT = new Date('2026-11-12T05:00:00.000Z');

const atKm = (km: number): Date =>
    new Date(START.getTime() + (DURATION * km) / ROAD_KM);

const plan = (overrides: Record<string, unknown> = {}) => ({
    needed: 800,
    uncoveredKm: 120,
    coveredKm: 280,
    hpLostTotal: 7260,
    settledKm: 0,
    foodConsumedAt: null,
    ...overrides,
});

const twentyEightF20 = () => [
    { itemType: 'LootItem' as const, item: F20, quantity: 28 },
];

// viaggio legacy: nessuna chiave food nel viaggio
const NO_PLAN = null;

const snapshotAt = (
    km: number,
    food: unknown = plan(),
): AmbushCharacterSnapshot => ({
    _id: CHARACTER_ID,
    status: {
        xp: 0,
        level: 1,
        title: TitleType.rookie,
        currentLifePoints: 1000,
        maxLifePoints: 1000,
        injuries: [],
        spellStates: [],
        activeTravel: {
            road: {
                coordinates: [
                    [0, 0],
                    [0, 3.6],
                ],
                distance: ROAD_KM,
            },
            startTime: START,
            endTime: END,
            duration: DURATION,
            to: TO_ID,
            kind: TravelKind.free,
            ambush: { at: atKm(km), km, attempts: 0 },
            ...(food === NO_PLAN ? {} : { food }),
        },
    },
    quests: { completedQuests: [] },
    assets: { ownedItems: twentyEightF20(), ownedEquipments: [] },
});

const foodAt = (km: number, food: unknown = plan(), now = atKm(km)) =>
    ambushFoodOf({ snapshot: snapshotAt(km, food), catalog, now });

describe('ambush food step', () => {
    it('has no food step for a travel without a saved plan (D-11)', () => {
        expect(foodAt(290, NO_PLAN)).toBeNull();
        expect(foodAt(290, plan({ hpLostTotal: 1 }))).toBeNull();
    });

    it('charges the hunger up to the ambush kilometre and eats the boundary meal (D-07)', () => {
        const food = foodAt(290);

        expect(food?.progress?.hpLoss).toBe(55);
        expect(food?.progress?.lifeAfter).toBe(945);
        expect(food?.progress?.consumed).toEqual([
            { itemId: F20, quantity: 28 },
        ]);
        expect(food?.progress?.settledKm).toBe(290);
        expect(food?.defeat).toBeNull();
        expect(food?.hpRaw).toBe(1000);
        expect(food?.food).toEqual(plan());
    });

    it('prepares only the meal of the travelled kilometres for a defeat inside the covered stretch (D-03)', () => {
        const food = foodAt(30);

        expect(food?.progress).toBeNull();
        expect(food?.defeat?.consumed).toEqual([{ itemId: F20, quantity: 3 }]);
        expect(food?.defeat?.hpLoss).toBe(0);
    });

    it('settles at the saved ambush kilometre whatever the clock (D-16)', () => {
        const onTime = foodAt(290);
        const late = foodAt(
            290,
            plan(),
            new Date(atKm(290).getTime() + TEN_HOURS),
        );

        expect(late?.progress?.settledKm).toBe(290);
        expect(late?.progress?.hpLoss).toBe(onTime?.progress?.hpLoss);
    });

    it('fights with the life and the pantry after the hunger and the meal (D-07, D-18)', () => {
        const snapshot = snapshotAt(290);
        const food = ambushFoodOf({ snapshot, catalog, now: atKm(290) });
        const fighting = withFoodSettlement(snapshot, food?.progress ?? null);

        expect(fighting.status.currentLifePoints).toBe(945);
        expect(fighting.assets?.ownedItems).toEqual([]);
        expect({
            ...fighting,
            status: { ...fighting.status, currentLifePoints: 1000 },
            assets: { ...fighting.assets, ownedItems: twentyEightF20() },
        }).toEqual(snapshot);
        expect(withFoodSettlement(snapshot, null)).toBe(snapshot);
    });

    it('merges the boundary and the defeat meals for the defeat guards (D-14)', () => {
        const insideCovered = defeatSettlementOf(foodAt(30)!);
        expect(insideCovered?.consumed).toEqual([{ itemId: F20, quantity: 3 }]);
        expect(insideCovered?.foodConsumedAt).toEqual(atKm(30));

        const pastBoundary = defeatSettlementOf(foodAt(290)!);
        expect(pastBoundary?.consumed).toEqual([{ itemId: F20, quantity: 28 }]);

        const alreadyEaten = foodAt(
            290,
            plan({ settledKm: 290, foodConsumedAt: EATEN_AT }),
        );
        expect(defeatSettlementOf(alreadyEaten!)).toBeNull();
    });
});
