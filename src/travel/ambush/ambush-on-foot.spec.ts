import { Types } from 'mongoose';
import type { InventoryEntry } from 'src/economy/trade/trade-inventory';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { LonLat } from 'src/roads/road-route';
import type { FoodStack } from '../food/food-selection';
import { foodPlanOf, planTravelFood } from '../food/travel-food';
import { foodLegOf, settlementOf } from '../food/travel-food-settlement';
import {
    isMountFallen,
    onFootFoodOf,
    onFootTravelOf,
    type OnFootTravelInput,
} from './ambush-on-foot';

const TO_ID = new Types.ObjectId('64b0000000000000000000c8');
const HORSE = new Types.ObjectId('64b0000000000000000000a1');
const WOLF = new Types.ObjectId('64b0000000000000000000a2');
const BREAD = new Types.ObjectId('64b000000000000000000020');
const T0 = new Date('2026-11-14T08:00:00.000Z');
const HOUR_MS = 3_600_000;
const AT = new Date(T0.getTime() + 4 * HOUR_MS);
const POINT: LonLat = [0, 3.6];

const travelWith = (
    overrides: Partial<OnFootTravelInput['travel']> = {},
): OnFootTravelInput['travel'] => ({
    road: {
        coordinates: [
            [0, 0],
            [0, 5],
            [0, 9],
        ],
        distance: 100,
    },
    startTime: T0,
    endTime: new Date(T0.getTime() + 10 * HOUR_MS),
    duration: 10 * HOUR_MS,
    to: TO_ID,
    kind: TravelKind.quest,
    ambush: { at: AT, km: 40, attempts: 0 },
    mount: { pet: HORSE, factor: 2 },
    ...overrides,
});

const onFootWith = (overrides: Partial<OnFootTravelInput> = {}) =>
    onFootTravelOf({
        travel: travelWith(),
        point: POINT,
        segment: 1,
        next: null,
        woundsSlowdown: 1,
        ...overrides,
    });

describe('the residual road on foot (Phase 23)', () => {
    it('rewrites the residual road on foot from the ambush point (D-13)', () => {
        expect(onFootWith()).toEqual({
            road: {
                coordinates: [POINT, [0, 5], [0, 9]],
                distance: 60,
            },
            startTime: AT,
            endTime: new Date(AT.getTime() + 12 * HOUR_MS),
            duration: 12 * HOUR_MS,
            to: TO_ID,
            kind: TravelKind.quest,
            next: null,
        });
    });

    it('walks at the mounted pace when the saved factor is unreadable (D-13)', () => {
        for (const mount of [{ pet: HORSE, factor: 0 }, { pet: HORSE }, null]) {
            const walked = onFootWith({ travel: travelWith({ mount }) });
            expect(walked.duration).toBe(6 * HOUR_MS);
        }
    });

    it('remaps the next ambush by kilometres without drawing (D-29)', () => {
        const next = { at: new Date(T0.getTime() + 7 * HOUR_MS), km: 70 };
        expect(onFootWith({ next }).next).toEqual({
            km: 30,
            at: new Date(AT.getTime() + Math.floor((30 / 60) * 12 * HOUR_MS)),
        });
    });

    it('drops a next ambush beyond the residual road and keeps none when there was none (D-29)', () => {
        const beyond = { at: new Date(T0.getTime() + 10 * HOUR_MS), km: 100 };
        expect(onFootWith({ next: beyond }).next).toBeNull();
        expect(onFootWith({ next: null }).next).toBeNull();
    });

    it('falls only when the defeated companion is the departure mount faster than walking (D-13, D-29)', () => {
        const mount = { pet: HORSE, factor: 2 };
        expect(isMountFallen(mount, { petId: HORSE, defeated: true })).toBe(
            true,
        );
        expect(isMountFallen(mount, { petId: WOLF, defeated: true })).toBe(
            false,
        );
        expect(isMountFallen(mount, { petId: HORSE, defeated: false })).toBe(
            false,
        );
        expect(isMountFallen(mount, { petId: null, defeated: true })).toBe(
            false,
        );
        expect(isMountFallen(mount, null)).toBe(false);
        for (const factor of [1, 0.5]) {
            expect(
                isMountFallen(
                    { pet: HORSE, factor },
                    { petId: HORSE, defeated: true },
                ),
            ).toBe(false);
        }
        for (const missing of [undefined, null, {}]) {
            expect(
                isMountFallen(missing, { petId: HORSE, defeated: true }),
            ).toBe(false);
        }
    });

    describe('the food of the road on foot', () => {
        const stacks: FoodStack[] = [
            { itemId: BREAD, power: 20, sellCopper: 1, quantity: 5 },
        ];
        const ownedItems: InventoryEntry[] = [
            { itemType: 'LootItem', item: BREAD, quantity: 5 },
        ];
        const ingress = {
            durationMs: 12 * HOUR_MS,
            distanceKm: 60,
            hpBefore: 1000,
            stacks,
        };

        it('replans the food of the residual road on foot (D-13)', () => {
            const plan = planTravelFood(ingress);
            expect(onFootFoodOf(ingress)).toEqual({
                plan,
                food: foodPlanOf(plan, 60),
            });
        });

        it('settles the new leg at arrival with one meal and the hunger counted once (A3)', () => {
            const { plan, food } = onFootFoodOf(ingress);
            const rewritten = onFootWith();
            const leg = foodLegOf({ ...rewritten, food });
            expect(leg).not.toBeNull();
            const arrival = settlementOf({
                leg: leg!,
                targetKm: rewritten.road.distance,
                moment: 'arrival',
                lifeNow: ingress.hpBefore,
                assets: { ownedItems },
                stacks,
                now: rewritten.endTime,
            });
            expect(plan.hpLost).toBeGreaterThan(0);
            expect(arrival?.lifeAfter).toBe(ingress.hpBefore - plan.hpLost);
            expect(arrival?.consumed).toEqual(plan.consumed);
            expect(arrival?.ownedItems).toEqual([]);
        });
    });
});
