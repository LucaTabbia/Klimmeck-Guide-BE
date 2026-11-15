import type { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import { RoadsService } from 'src/roads/roads.service';
import { foodPlanOf, planTravelFood } from 'src/travel/food/travel-food';
import { TravelCompletionService } from 'src/travel/travel-completion.service';
import { travelJobId } from 'src/travel/travel-job';
import { TravelModule } from 'src/travel/travel.module';
import { TravelScheduler } from 'src/travel/travel-scheduler.service';
import { BASE_SPEED, durationMsOf } from 'src/travel/travel-timing';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { buildQuest, persistPet, persistQuest } from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    type AmbushWorld,
    persistAmbushEnemies,
    persistAmbushWorld,
    persistTraveller,
    rollsHittingKm,
    SINGLE_FIRST_CANDIDATE,
    type Traveller,
} from '../../../test/travel/ambush-world';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    foodStack,
    persistFood,
} from '../../../test/travel/travel-food.fixture';
import { ambushJobId } from './ambush-job';
import { AmbushResolutionService } from './ambush-resolution.service';
import { AmbushModule } from './ambush.module';

// 400 km in 40 h a cavallo (fattore 2), imboscata al km 30: restano 370 km in 2 × 37 h a piedi
const START = new Date('2026-11-14T06:00:00.000Z');
const ROAD_KM = 400;
const RIDE_MS = 144_000_000;
const AMBUSH_KM = 30;
const FACTOR = 2;
const RESIDUAL_KM = ROAD_KM - AMBUSH_KM;
const WALK_MS = Math.round(
    (RIDE_MS - (RIDE_MS * AMBUSH_KM) / ROAD_KM) * FACTOR,
);
const NEXT_KM = 100;
const ONE_MINUTE_MS = 60_000;
const COMPANION_RECOVERY_MS = 3_600_000;
// piano della partenza: 280 km coperti, 120 scoperti; al km 30 lo stop mangia 3 cibi da 20 power
const RIDE_FOOD = {
    needed: 800,
    uncoveredKm: 120,
    coveredKm: 280,
    hpLostTotal: 7260,
    settledKm: 0,
    foodConsumedAt: null,
};
// 73 cibi: 3 allo stop, 70 (1400 power) per i 1480 della strada a piedi → 20 km scoperti, fame 210
const PANTRY = 73;
const AFTER_STOP = PANTRY - 3;
// sotto la fame della strada a piedi (210): con questa vita il personaggio non arriverebbe vivo (D-16)
const STARVING_HP = 150;

describe('the residual road on foot (replica set)', () => {
    const clock = new FixedClock(START);
    const chance = new SequenceChance();
    const combat = new ScriptedCombatResolver();
    const travelQueue = new FakeTravelQueue();
    let world: OutcomeHarness;
    let service: AmbushResolutionService;
    let map: AmbushWorld;
    let food: { _id: Types.ObjectId };
    let seq = 0;

    const moveClockTo = (instant: Date): void =>
        clock.advanceSeconds(
            (instant.getTime() - clock.now().getTime()) / 1000,
        );

    const rawOf = async (subject: Traveller): Promise<any> =>
        world.models.characters
            .findById(subject.characterId)
            .lean<any>()
            .exec();

    const ambushResultOf = async (subject: Traveller): Promise<any> => {
        const results = await world.models.questResults
            .find({ character: subject.characterId, kind: 'ambush' })
            .lean<any[]>()
            .exec();
        expect(results).toHaveLength(1);
        return results[0];
    };

    // a cavallo sul compagno Fenrir, che cade nell'imboscata vinta; mount null = viaggio partito prima della fase
    const riderWith = async (
        mount: 'horse' | null,
        hp?: number,
    ): Promise<{ subject: Traveller; horse: Types.ObjectId }> => {
        seq += 1;
        const horse = (
            await persistPet(world.models.pets, {
                name: 'Cavallo',
                maxXp: 100,
                recoveryTime: COMPANION_RECOVERY_MS,
                speedModifier: FACTOR,
            })
        )._id as Types.ObjectId;
        const subject = await persistTraveller(world.harness, map, {
            twitchId: `on-foot-${seq}`,
            startTime: START,
            km: AMBUSH_KM,
            distanceKm: ROAD_KM,
            durationMs: RIDE_MS,
            food: RIDE_FOOD,
            hp,
            characterOverrides: {
                assets: {
                    pet: horse,
                    ownedPets: [
                        buildOwnedPet(horse, {
                            currentLifePoints: 7,
                            level: 1,
                            name: 'Fenrir',
                        }),
                    ],
                    ownedItems: [foodStack(food, PANTRY)],
                },
            },
        });
        if (mount) {
            await world.models.characters.updateOne(
                { _id: subject.characterId },
                {
                    $set: {
                        'status.activeTravel.mount': {
                            pet: horse,
                            factor: FACTOR,
                        },
                    },
                },
            );
        }
        moveClockTo(new Date(subject.identity.at.getTime() + ONE_MINUTE_MS));
        return { subject, horse };
    };

    const ambushFallsTheMount = (
        subject: Traveller,
        nextKm: number | null,
    ): void => {
        chance.load([
            ...SINGLE_FIRST_CANDIDATE,
            ...(nextKm === null ? [] : rollsHittingKm(nextKm, AMBUSH_KM)),
        ]);
        combat
            .willEnd('success')
            .willResolve(subject.characterId, { companionLifeAfter: 1 });
    };

    const ambushLostWith = (
        subject: Traveller,
        companionLifeAfter: number,
    ): void => {
        chance.load([...SINGLE_FIRST_CANDIDATE]);
        combat.willEnd('failure').willResolve(subject.characterId, {
            hpAfter: 0,
            companionLifeAfter,
        });
    };

    // in viaggio verso una quest della corsia standard col posto occupato
    const onQuestLane = async (
        subject: Traveller,
    ): Promise<{ quest: Types.ObjectId; pending: Types.ObjectId }> => {
        const quest = await persistQuest(
            world.models.quests,
            buildQuest({
                registeredAdventurers: [
                    { character: subject.characterId, title: TitleType.rookie },
                ],
            }),
        );
        const pending = await world.models.pendingQuests.create({
            startDate: null,
            arrivedAt: null,
            waitingTime: 0,
            pointsSpent: 0,
            quest: quest._id,
        });
        await world.models.characters.updateOne(
            { _id: subject.characterId },
            {
                $set: {
                    'quests.pendingQuest': pending._id,
                    'status.activeTravel.kind': 'quest',
                    'status.activeTravel.to': map.questPoi,
                },
            },
        );
        return {
            quest: quest._id as Types.ObjectId,
            pending: pending._id as Types.ObjectId,
        };
    };

    const walkFoodOf = (hpBefore: number) =>
        planTravelFood({
            durationMs: WALK_MS,
            distanceKm: RESIDUAL_KM,
            hpBefore,
            stacks: [
                {
                    itemId: food._id,
                    power: 20,
                    sellCopper: 0,
                    quantity: AFTER_STOP,
                },
            ],
        });

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat,
            travelQueue,
            createApp: createCharactersTestApp,
            imports: [TravelModule, AmbushModule, QuestResultsModule],
        });
        service = world.harness.app.get(AmbushResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        combat.reset();
        chance.load([]);
        moveClockTo(START);
        map = await persistAmbushWorld(
            world.harness.connection,
            world.harness.app.get(RoadsService),
        );
        await persistAmbushEnemies(world.harness.connection);
        food = (await persistFood(world.models.lootItems, 20)) as {
            _id: Types.ObjectId;
        };
    });

    afterAll(async () => {
        await world.harness.close();
    });

    it('rewrites the travel on foot from the ambush point (D-13)', async () => {
        const { subject } = await riderWith('horse');
        const { at } = subject.identity;
        ambushFallsTheMount(subject, null);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        const { activeTravel } = raw.status;
        expect(activeTravel.startTime).toEqual(at);
        expect(activeTravel.duration).toBe(WALK_MS);
        expect(activeTravel.endTime).toEqual(new Date(at.getTime() + WALK_MS));
        expect(activeTravel.road.distance).toBe(RESIDUAL_KM);
        expect(activeTravel.to).toEqual(subject.travel.to);
        expect(Object.keys(activeTravel)).not.toContain('mount');
        expect(activeTravel.food).toEqual(
            foodPlanOf(walkFoodOf(raw.status.currentLifePoints), RESIDUAL_KM),
        );
        expect(raw.assets.ownedItems).toEqual([foodStack(food, AFTER_STOP)]);
        expect(raw.assets.pet).toBeNull();
        expect((await ambushResultOf(subject)).ambush.onFoot).toBe(true);
    });

    it('moves the completion job and the next ambush job to the new travel (Pitfall 5)', async () => {
        const { subject } = await riderWith('horse');
        const { at, characterId } = subject.identity;
        await world.harness.app.get(TravelScheduler).schedule(characterId, {
            startTime: START,
            endTime: new Date(START.getTime() + RIDE_MS),
        });
        travelQueue.added.length = 0;
        ambushFallsTheMount(subject, NEXT_KM);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const endTime = new Date(at.getTime() + WALK_MS);
        const nextAt = new Date(
            at.getTime() +
                Math.floor(((NEXT_KM - AMBUSH_KM) / RESIDUAL_KM) * WALK_MS),
        );
        const { activeTravel } = (await rawOf(subject)).status;
        expect(activeTravel.ambush).toEqual({
            at: nextAt,
            km: NEXT_KM - AMBUSH_KM,
            attempts: 0,
        });
        expect(travelQueue.removed).toEqual([travelJobId(characterId, START)]);
        expect(
            travelQueue.added.map(({ name, options }) => [name, options.jobId]),
        ).toEqual([
            ['complete', travelJobId(characterId, at)],
            ['ambush', ambushJobId(characterId, at, nextAt)],
        ]);
        expect(travelQueue.added[0].data).toEqual({
            characterId: characterId.toHexString(),
            startTime: at.getTime(),
            endTime: endTime.getTime(),
        });
    });

    it('tells the rest of the road on foot in the push (D-13, D-14)', async () => {
        const { subject } = await riderWith('horse');
        await registerDevice(world.harness, subject.player);
        ambushFallsTheMount(subject, null);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        expect(world.push.sent).toHaveLength(1);
        expect(world.push.sent[0].message.body).toMatch(
            /: Fenrir è stato sconfitto, prosegui a piedi$/,
        );
    });

    it('keeps the travel of a journey without a departure mount (D-29)', async () => {
        const { subject } = await riderWith(null);
        ambushFallsTheMount(subject, null);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        expect(raw.status.activeTravel.startTime).toEqual(START);
        expect(raw.status.activeTravel.endTime).toEqual(
            new Date(START.getTime() + RIDE_MS),
        );
        expect(raw.status.activeTravel.food.needed).toBe(RIDE_FOOD.needed);
        expect(raw.assets.ownedItems).toEqual([foodStack(food, PANTRY)]);
        expect(raw.assets.pet).toBeNull();
        expect((await ambushResultOf(subject)).ambush.onFoot).toBe(false);
        expect(travelQueue.removed).toEqual([]);
    });

    it('arrives on foot and settles the new food plan once (D-13, A3)', async () => {
        const { subject } = await riderWith('horse');
        const { at, characterId } = subject.identity;
        ambushFallsTheMount(subject, null);
        await expect(service.resolve(subject.identity)).resolves.toBe('won');
        const lifeAfterFight = (await rawOf(subject)).status.currentLifePoints;
        const endTime = new Date(at.getTime() + WALK_MS);
        moveClockTo(endTime);

        await expect(
            world.harness.app
                .get(TravelCompletionService)
                .complete({ characterId, startTime: at, endTime }),
        ).resolves.toBe('completed');

        const raw = await rawOf(subject);
        const walk = walkFoodOf(lifeAfterFight);
        expect(walk.hpLost).toBe(210);
        expect(raw.status.activeTravel).toBeNull();
        expect(raw.status.currentLifePoints).toBe(lifeAfterFight - walk.hpLost);
        expect(raw.assets.ownedItems).toEqual([]);
    });
    describe('the travel identity after the walk on foot (Pitfall 5)', () => {
        it('turns the completion job of the ridden travel into a no-op without a travel end push (D-13, Pitfall 5)', async () => {
            const { subject } = await riderWith('horse');
            await registerDevice(world.harness, subject.player);
            const { characterId } = subject.identity;
            ambushFallsTheMount(subject, null);
            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );
            const ridden = new Date(START.getTime() + RIDE_MS);
            moveClockTo(ridden);

            await expect(
                world.harness.app.get(TravelCompletionService).complete({
                    characterId,
                    startTime: START,
                    endTime: ridden,
                }),
            ).resolves.toBe('stale');

            expect(world.push.sent.map(({ message }) => message.type)).toEqual([
                'ambush',
            ]);
            expect(
                (await rawOf(subject)).status.activeTravel.startTime,
            ).toEqual(subject.identity.at);
        });

        it('turns the completion job of the walk into a no-op once the traveller is moved off the road (D-13, Pitfall 5)', async () => {
            const { subject } = await riderWith('horse');
            await registerDevice(world.harness, subject.player);
            const { at, characterId } = subject.identity;
            ambushFallsTheMount(subject, null);
            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );
            await world.models.characters.updateOne(
                { _id: characterId },
                { $set: { 'status.activeTravel': null } },
            );
            const walked = new Date(at.getTime() + WALK_MS);
            moveClockTo(walked);

            await expect(
                world.harness.app
                    .get(TravelCompletionService)
                    .complete({ characterId, startTime: at, endTime: walked }),
            ).resolves.toBe('stale');

            expect(world.push.sent.map(({ message }) => message.type)).toEqual([
                'ambush',
            ]);
        });
    });

    describe('the hunger redirection (Phase 23)', () => {
        it('redirects to the nearest city and abandons the quest when the food no longer suffices (D-16)', async () => {
            const { subject } = await riderWith('horse', STARVING_HP);
            const { quest, pending } = await onQuestLane(subject);
            const { at } = subject.identity;
            ambushFallsTheMount(subject, null);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            const raw = await rawOf(subject);
            const { activeTravel } = raw.status;
            expect(activeTravel.to).toEqual(map.markers.alba);
            expect(activeTravel.kind).toBe('free');
            expect(activeTravel.startTime).toEqual(at);
            expect(activeTravel.duration).toBe(
                durationMsOf(activeTravel.road.distance, BASE_SPEED),
            );
            expect(Object.keys(activeTravel)).not.toContain('food');
            expect(Object.keys(activeTravel)).not.toContain('ambush');
            expect(raw.assets.ownedItems).toEqual([
                foodStack(food, AFTER_STOP),
            ]);
            expect(raw.quests.pendingQuest).toBeNull();
            expect(
                await world.models.pendingQuests.countDocuments({
                    _id: pending,
                }),
            ).toBe(0);
            expect(
                (await world.models.quests.findById(quest).lean<any>().exec())
                    .registeredAdventurers,
            ).toEqual([]);
            const result = await ambushResultOf(subject);
            expect(result.outcome).toBe(QuestOutcome.success);
            expect(result.ambush.reachedCity).toEqual(
                expect.objectContaining({ name: 'Alba' }),
            );
            expect(result.ambush.onFoot).toBe(true);
        });

        it('keeps the quest and walks to the goal when no city is reachable by road, even starving (D-16, D-25)', async () => {
            const { subject } = await riderWith('horse', STARVING_HP);
            await registerDevice(world.harness, subject.player);
            const { quest, pending } = await onQuestLane(subject);
            await world.harness.connection.collection('roads').deleteMany({});
            await world.harness.app.get(RoadsService).buildGraph();
            ambushFallsTheMount(subject, null);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            const raw = await rawOf(subject);
            expect(raw.status.activeTravel.to).toEqual(map.questPoi);
            expect(raw.status.activeTravel.duration).toBe(WALK_MS);
            expect(raw.quests.pendingQuest).toEqual(pending);
            expect(
                await world.models.pendingQuests.countDocuments({
                    _id: pending,
                }),
            ).toBe(1);
            expect(
                (await world.models.quests.findById(quest).lean<any>().exec())
                    .registeredAdventurers,
            ).toHaveLength(1);
            expect(
                (await ambushResultOf(subject)).ambush.reachedCity,
            ).toBeNull();
            expect(world.push.sent[0].message.body).toMatch(
                /: Fenrir è stato sconfitto, prosegui a piedi$/,
            );
        });

        it('moves the jobs to the redirected travel and plans no ambush (D-16, Pitfall 5)', async () => {
            const { subject } = await riderWith('horse', STARVING_HP);
            const { at, characterId } = subject.identity;
            await world.harness.app.get(TravelScheduler).schedule(characterId, {
                startTime: START,
                endTime: new Date(START.getTime() + RIDE_MS),
            });
            travelQueue.added.length = 0;
            ambushFallsTheMount(subject, NEXT_KM);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            expect(Object.keys(activeTravel)).not.toContain('ambush');
            expect(travelQueue.removed).toEqual([
                travelJobId(characterId, START),
            ]);
            expect(
                travelQueue.added.map(({ name, options }) => [
                    name,
                    options.jobId,
                ]),
            ).toEqual([['complete', travelJobId(characterId, at)]]);
            expect(travelQueue.added[0].data).toEqual({
                characterId: characterId.toHexString(),
                startTime: at.getTime(),
                endTime: activeTravel.endTime.getTime(),
            });
        });

        it('tells the hunger redirection in the push (D-14, D-16)', async () => {
            const { subject } = await riderWith('horse', STARVING_HP);
            await registerDevice(world.harness, subject.player);
            ambushFallsTheMount(subject, null);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            expect(world.push.sent).toHaveLength(1);
            expect(world.push.sent[0].message.body).toMatch(
                /: Fenrir è stato sconfitto, prosegui a piedi; la fame ti porta verso Alba$/,
            );
        });

        it('walks the detour of a lost ambush whose companion falls (D-16, C-11)', async () => {
            const { subject } = await riderWith('horse');
            ambushLostWith(subject, 1);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const raw = await rawOf(subject);
            const { activeTravel } = raw.status;
            const walked = durationMsOf(activeTravel.road.distance, BASE_SPEED);
            expect(activeTravel.to).toEqual(map.markers.alba);
            expect(activeTravel.duration).toBe(walked);
            expect(activeTravel.endTime).toEqual(
                new Date(subject.identity.at.getTime() + walked),
            );
            expect(raw.assets.pet).toBeNull();
            expect((await ambushResultOf(subject)).ambush.onFoot).toBe(true);
        });

        it('rides the detour of a lost ambush whose companion stands (D-29, C-11)', async () => {
            const { subject } = await riderWith('horse');
            ambushLostWith(subject, 4);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            expect(activeTravel.duration).toBe(
                durationMsOf(activeTravel.road.distance, BASE_SPEED * FACTOR),
            );
            expect((await ambushResultOf(subject)).ambush.onFoot).toBe(false);
        });

        it('goes on foot to the goal when the food is enough (D-13)', async () => {
            const { subject } = await riderWith('horse');
            const { pending } = await onQuestLane(subject);
            ambushFallsTheMount(subject, null);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            const raw = await rawOf(subject);
            expect(raw.status.activeTravel.to).toEqual(map.questPoi);
            expect(raw.status.activeTravel.duration).toBe(WALK_MS);
            expect(raw.quests.pendingQuest).toEqual(pending);
            const result = await ambushResultOf(subject);
            expect(result.ambush.reachedCity).toBeNull();
            expect(result.ambush.onFoot).toBe(true);
        });
    });
});
