import { Types } from 'mongoose';
import { AuthorizationErrorCode } from 'src/authz/authorization-error-code.enum';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { TravelKind } from 'src/models/character/active-travel.model';
import {
    classifyUnstarted,
    classifyUnteleported,
    COMPLETION_PROJECTION,
    COMPLETION_UPDATE,
    completionFilter,
    DUE_TRAVEL_PROJECTION,
    dueTravelsFilter,
    questArrivalFilter,
    questArrivalUpdate,
    startTravelFilter,
    startTravelUpdate,
    TELEPORT_FOOD_PROJECTION,
    TELEPORT_PROJECTION,
    teleportFilter,
    teleportUpdate,
} from './travel.updates';
import { ActiveTravelDraft } from './travel-timing';

function codeOf(error: Error): string {
    return (error as GameRuleException | ResourceNotFoundException).code;
}

describe('travel write builders', () => {
    const id = new Types.ObjectId();
    const loc = new Types.ObjectId();
    const poi = new Types.ObjectId();
    const pending = new Types.ObjectId();
    const start = new Date('2026-10-21T10:00:00.000Z');
    const end = new Date('2026-10-21T11:00:00.000Z');
    const now = new Date('2026-10-21T11:00:05.000Z');

    describe('start', () => {
        it('startTravelFilter reasserts no aid wait, no travel, no standard quest and the snapshot position on the active character', () => {
            const filter = startTravelFilter(id, loc);

            expect(filter).toEqual({
                _id: id,
                deletedAt: null,
                'status.awaitingAid': null,
                'status.activeTravel': null,
                'quests.pendingQuest': null,
                'status.location': { $in: [loc, loc.toHexString()] },
            });
            expect(filter._id).toBeInstanceOf(Types.ObjectId);
        });

        it('startTravelUpdate sets the active travel', () => {
            const travel: ActiveTravelDraft = {
                road: { coordinates: [[0, 0]], distance: 0 },
                startTime: start,
                endTime: end,
                duration: 3_600_000,
                to: poi,
                kind: TravelKind.free,
            };

            expect(startTravelUpdate(travel)).toEqual({
                $set: { 'status.activeTravel': travel },
            });
        });

        it('startTravelFilter appends the extra guards of the departure (D-05)', () => {
            const until = new Date('2026-10-21T09:00:00.000Z');

            const filter = startTravelFilter(id, loc, {
                'status.imprisonedUntil': until,
            });

            expect(filter).toEqual({
                _id: id,
                deletedAt: null,
                'status.awaitingAid': null,
                'status.activeTravel': null,
                'quests.pendingQuest': null,
                'status.location': { $in: [loc, loc.toHexString()] },
                'status.imprisonedUntil': until,
            });
            expect(Object.keys(filter)).not.toContain('$and');
        });

        it('startTravelUpdate writes the saved food plan inside the travel and nothing else (D-05)', () => {
            const travel: ActiveTravelDraft = {
                road: { coordinates: [[0, 0]], distance: 20 },
                startTime: start,
                endTime: end,
                duration: 3_600_000,
                to: poi,
                kind: TravelKind.free,
            };
            const food = {
                needed: 20,
                uncoveredKm: 10,
                coveredKm: 10,
                hpLostTotal: 55,
                settledKm: 0,
                foodConsumedAt: null,
            };

            const update = startTravelUpdate({ ...travel, food });

            expect(update).toEqual({
                $set: { 'status.activeTravel': { ...travel, food } },
            });
            expect(Object.keys(update.$set)).toEqual(['status.activeTravel']);
        });

        it('classifyUnstarted: missing character → NOT_FOUND', () => {
            const error = classifyUnstarted(null);

            expect(error).toBeInstanceOf(ResourceNotFoundException);
            expect(codeOf(error)).toBe(AuthorizationErrorCode.NOT_FOUND);
            expect(error.message).toBe('Personaggio non trovato');
        });

        it('classifyUnstarted: an aid wait → AWAITING_AID, before a running travel', () => {
            expect(
                codeOf(
                    classifyUnstarted({
                        status: {
                            awaitingAid: { aidQuest: pending },
                            activeTravel: { endTime: end },
                        },
                    }),
                ),
            ).toBe(GameRuleErrorCode.AWAITING_AID);
        });

        it('classifyUnstarted: a travel already running → TRAVEL_IN_PROGRESS', () => {
            expect(
                codeOf(
                    classifyUnstarted({
                        status: { activeTravel: { endTime: end } },
                    }),
                ),
            ).toBe(GameRuleErrorCode.TRAVEL_IN_PROGRESS);
        });

        it('classifyUnstarted: a standard quest → QUEST_IN_PROGRESS', () => {
            expect(
                codeOf(
                    classifyUnstarted({
                        status: { activeTravel: null },
                        quests: { pendingQuest: pending },
                    }),
                ),
            ).toBe(GameRuleErrorCode.QUEST_IN_PROGRESS);
        });

        it('classifyUnstarted: position moved by a concurrent movement → TRAVEL_IN_PROGRESS', () => {
            expect(
                codeOf(
                    classifyUnstarted({
                        status: { activeTravel: null },
                        quests: { pendingQuest: null },
                    }),
                ),
            ).toBe(GameRuleErrorCode.TRAVEL_IN_PROGRESS);
        });
    });

    describe('completion', () => {
        it('completionFilter matches the same travel only once it is due and without a pending ambush (D-13)', () => {
            expect(
                completionFilter(
                    { characterId: id, startTime: start, endTime: end },
                    now,
                ),
            ).toEqual({
                _id: id,
                deletedAt: null,
                'status.activeTravel.startTime': start,
                'status.activeTravel.endTime': { $eq: end, $lte: now },
                'status.activeTravel.ambush': null,
            });
        });

        it('COMPLETION_UPDATE copies the destination into the location in a pipeline', () => {
            expect(COMPLETION_UPDATE).toEqual([
                {
                    $set: {
                        'status.location': '$status.activeTravel.to',
                        'status.activeTravel': null,
                    },
                },
            ]);
        });

        it('COMPLETION_PROJECTION reads the pending quest, the travel kind, the destination, the held reports and the food plan (D-13, D-05, D-07)', () => {
            expect(COMPLETION_PROJECTION).toEqual({
                'quests.pendingQuest': 1,
                'status.activeTravel.kind': 1,
                'status.activeTravel.to': 1,
                'status.activeTravel.ambushReports': 1,
                'status.activeTravel.road.distance': 1,
                'status.activeTravel.duration': 1,
                'status.activeTravel.food': 1,
            });
        });

        it('questArrivalFilter matches the pending quest not yet arrived', () => {
            expect(questArrivalFilter(pending)).toEqual({
                _id: pending,
                arrivedAt: null,
            });
        });

        // arrivo ≠ avvio (utente 2026-10-25): startDate lo scrive solo QuestStartService
        it('questArrivalUpdate marks the planned arrival, not the start', () => {
            expect(questArrivalUpdate(end)).toEqual({
                $set: { arrivedAt: end },
            });
        });

        // quest da soli: l'avvio coincide con l'arrivo e si scrive con lui (D-22)
        it('writes the solo start with the arrival (D-22)', () => {
            expect(questArrivalUpdate(end, end)).toEqual({
                $set: { arrivedAt: end, startDate: end },
            });
            expect(questArrivalUpdate(end, null)).toEqual({
                $set: { arrivedAt: end },
            });
        });
    });

    describe('teleport', () => {
        // il soccorso non blocca il teleport del GM (D-07)
        it('teleportFilter only requires an active character without a standard quest, even awaiting aid', () => {
            expect(teleportFilter(id)).toEqual({
                _id: id,
                deletedAt: null,
                'quests.pendingQuest': null,
            });
        });

        it('teleportUpdate moves the character and cancels the travel', () => {
            expect(teleportUpdate(poi)).toEqual({
                $set: { 'status.location': poi, 'status.activeTravel': null },
            });
        });

        it('adds the city geography to the teleport (D-05)', () => {
            const a = new Types.ObjectId();
            const b = new Types.ObjectId();

            expect(teleportUpdate(poi, [a, b])).toEqual({
                $set: { 'status.location': poi, 'status.activeTravel': null },
                $addToSet: { 'status.unlockedLore': { $each: [a, b] } },
            });
            expect(teleportUpdate(poi, [])).toEqual({
                $set: { 'status.location': poi, 'status.activeTravel': null },
            });
        });

        it('teleportUpdate closes the food of a started travel in the same set (D-17)', () => {
            expect(
                teleportUpdate(poi, [], {
                    'status.currentLifePoints': 994,
                    'assets.ownedItems': [],
                }),
            ).toEqual({
                $set: {
                    'status.location': poi,
                    'status.activeTravel': null,
                    'status.currentLifePoints': 994,
                    'assets.ownedItems': [],
                },
            });
        });

        it('TELEPORT_FOOD_PROJECTION reads the identity, the clock fields, the pending ambush kilometre and the food plan (D-17)', () => {
            expect(TELEPORT_FOOD_PROJECTION).toEqual({
                'status.activeTravel.startTime': 1,
                'status.activeTravel.duration': 1,
                'status.activeTravel.road.distance': 1,
                'status.activeTravel.ambush.km': 1,
                'status.activeTravel.food': 1,
            });
        });

        it('TELEPORT_PROJECTION reads the travel start, the pending ambush and the held reports (D-13)', () => {
            expect(TELEPORT_PROJECTION).toEqual({
                'status.activeTravel.startTime': 1,
                'status.activeTravel.ambush': 1,
                'status.activeTravel.ambushReports': 1,
            });
        });

        it('classifyUnteleported: missing character → NOT_FOUND', () => {
            const error = classifyUnteleported(null);

            expect(error).toBeInstanceOf(ResourceNotFoundException);
            expect(error.message).toBe('Personaggio non trovato');
        });

        it.each([pending, null])(
            'classifyUnteleported: pending quest %p → QUEST_IN_PROGRESS',
            (pendingQuest) => {
                expect(
                    codeOf(classifyUnteleported({ quests: { pendingQuest } })),
                ).toBe(GameRuleErrorCode.QUEST_IN_PROGRESS);
            },
        );
    });

    describe('sweep', () => {
        it('dueTravelsFilter matches the due travels without a pending ambush (D-13)', () => {
            expect(dueTravelsFilter(now)).toEqual({
                deletedAt: null,
                'status.activeTravel.endTime': { $lte: now },
                'status.activeTravel.ambush': null,
            });
        });

        it('DUE_TRAVEL_PROJECTION reads the travel identity', () => {
            expect(DUE_TRAVEL_PROJECTION).toEqual({
                'status.activeTravel.startTime': 1,
                'status.activeTravel.endTime': 1,
            });
        });
    });
});
