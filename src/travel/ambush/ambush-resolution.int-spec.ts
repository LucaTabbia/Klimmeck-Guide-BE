import { Logger } from '@nestjs/common';
import { toCopper } from 'src/economy/coins';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { ResolutionLoader } from 'src/quests/outcomes/resolution-loader.service';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { RoadsService } from 'src/roads/roads.service';
import { travelJobId } from 'src/travel/travel-job';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistPet,
    persistQuest,
    persistSpell,
    spellStatesOf,
} from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    type AmbushEnemies,
    type AmbushWorld,
    persistAmbushEnemies,
    persistAmbushWorld,
    persistTraveller,
    type Traveller,
    type TravellerOptions,
} from '../../../test/travel/ambush-world';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import {
    foodStack,
    persistFood,
} from '../../../test/travel/travel-food.fixture';
import { ambushJobId } from './ambush-job';
import { AmbushResolutionService } from './ambush-resolution.service';
import { AmbushModule } from './ambush.module';

// ordine dei tiri della SequenceChance (fallback 0.99 = nessun colpo, nessun branco valido):
// 1. composizione (composeAmbushEnemies): forma (< 0.5 singolo), poi la scelta del singolo nel pool ordinato per id;
// 2. risorteggio (drawFrom) dal km dell'imboscata: un tiro per km, colpo sotto il rischio (0.002 / 0.006);
// 3. proprietario: nessun tiro; il combattimento scriptato non tira.
// [0, 0] = singolo, primo candidato (il lupo al km 10, il bandito al km 1); [0, 0, 0] = più il colpo al km successivo.
const START = new Date('2026-10-21T10:00:00.000Z');
const ONE_MINUTE_S = 60;
const LEVEL_TWO_XP = 250;
const LEVEL_TWENTY_XP = 50_000;
const WOLF_XP = 5;
const RECOVERY_MS = 5_000;
// lontano dal mezzo punto dell'arrotondamento: round(7 × 0,10) = 1, ancora nella fascia 4–7 del livello 1
const COMPANION_WOLF_XP = 7;
const COMPANION_SHARE = 1;
const COMPANION_LIFE = 7;

describe('AmbushResolutionService (replica set)', () => {
    const clock = new FixedClock(START);
    const chance = new SequenceChance();
    const combat = new ScriptedCombatResolver();
    const travelQueue = new FakeTravelQueue();
    let world: OutcomeHarness;
    let service: AmbushResolutionService;
    let map: AmbushWorld;
    let enemies: AmbushEnemies;
    let seq = 0;

    const moveClockTo = (instant: Date): void =>
        clock.advanceSeconds(
            (instant.getTime() - clock.now().getTime()) / 1000,
        );

    const traveller = async (
        options: Partial<TravellerOptions> & { km: number },
    ): Promise<Traveller> => {
        seq += 1;
        const subject = await persistTraveller(world.harness, map, {
            twitchId: `ambush-${seq}`,
            startTime: START,
            ...options,
        });
        moveClockTo(
            new Date(subject.identity.at.getTime() + ONE_MINUTE_S * 1000),
        );
        return subject;
    };

    const skippedLogsOf = async (subject: Traveller): Promise<string[]> => {
        const logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        try {
            await expect(service.resolve(subject.identity)).resolves.toBe(
                'skipped',
            );
            return logSpy.mock.calls.map(([message]) => String(message));
        } finally {
            logSpy.mockRestore();
        }
    };

    const rawOf = async (subject: Traveller): Promise<any> =>
        world.models.characters
            .findById(subject.characterId)
            .lean<any>()
            .exec();

    const ambushJobs = () =>
        travelQueue.added.filter((job) => job.name === 'ambush');

    const defeatOf = (
        subject: Traveller,
        injuriesAdded: InjuryType[] = [],
    ): void => {
        chance.load([0, 0]);
        combat.willEnd('failure').willResolve(subject.characterId, {
            hpAfter: 0,
            injuriesAdded,
        });
    };

    // in viaggio col compagno equipaggiato (voce a xp 0, tetto 100) accanto a un altro pet posseduto
    const travellerWithCompanion = async () => {
        const companion = (await persistPet(world.models.pets, { maxXp: 100 }))
            ._id;
        const other = (await persistPet(world.models.pets, { name: 'Altro' }))
            ._id;
        const ownedPets = [
            buildOwnedPet(other, { xp: 12 }),
            buildOwnedPet(companion, { currentLifePoints: COMPANION_LIFE }),
        ];
        await world.models.enemies.updateOne(
            { _id: enemies.wolf },
            { $set: { xp: COMPANION_WOLF_XP } },
        );
        const subject = await traveller({
            km: 10,
            characterOverrides: { assets: { pet: companion, ownedPets } },
        });
        return { subject, companion, ownedPets };
    };

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat,
            imports: [AmbushModule],
            travelQueue,
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
        enemies = await persistAmbushEnemies(world.harness.connection);
    });

    afterAll(async () => {
        await world.harness.close();
    });

    it('wins at once with the engine effects and the rank prizes (D-10)', async () => {
        const subject = await traveller({ km: 10 });
        chance.load([0, 0]);
        combat.willEnd('success').willResolve(subject.characterId, {
            hpAfter: 700,
            injuriesAdded: [InjuryType.brokenLeftArm],
        });

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        expect(raw.status.currentLifePoints).toBe(700);
        expect(raw.status.injuries).toContain(InjuryType.brokenLeftArm);
        expect(toCopper(raw.status.coins)).toBe(150);
        expect(raw.status.xp).toBe(40 + WOLF_XP);
        expect(combat.contexts).toHaveLength(1);
        expect(combat.contexts[0].quest.type).toBe('enemy');
        expect(combat.contexts[0].enemies.map((enemy) => enemy.id)).toEqual([
            enemies.wolf.toHexString(),
        ]);
    });

    it('teaches the enemies of a won ambush and holds the new lore in the report (D-06, D-09)', async () => {
        const subject = await traveller({ km: 10 });
        chance.load([0, 0]);
        const wolf = await world.models.enemies
            .findById(enemies.wolf)
            .lean<any>();
        const page = String(wolf.relatedLore[0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        expect(raw.status.unlockedLore.map(String)).toEqual([page]);
        expect(raw.status.knownEnemies.map(String)).toEqual([
            String(enemies.wolf),
        ]);
        expect(
            raw.status.activeTravel.ambushReports[0].loreUnlocked.map(String),
        ).toEqual([page]);
    });

    it('pays a legend as a hero (D-10)', async () => {
        const subject = await traveller({ km: 10, title: TitleType.legend });
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        expect(toCopper(raw.status.coins)).toBe(3750);
        expect(raw.status.xp).toBe(1000 + WOLF_XP);
        expect(raw.status.title).toBe(TitleType.legend);
    });

    it('keeps the title while the level rises (D-10)', async () => {
        const subject = await traveller({ km: 10, xp: LEVEL_TWO_XP - 1 });
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        expect(raw.status.level).toBe(2);
        expect(raw.status.title).toBe(TitleType.rookie);
        expect(raw.status.activeTravel.ambushReports[0].titleAfter).toBe(
            TitleType.rookie,
        );
    });

    it('keeps the travel and redraws from the ambush km (D-02)', async () => {
        const subject = await traveller({ km: 10 });
        chance.load([0, 0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const { activeTravel } = (await rawOf(subject)).status;
        const { road, startTime, endTime, duration, to, kind } = activeTravel;
        expect({ road, startTime, endTime, duration, to, kind }).toEqual({
            road: subject.travel.road,
            startTime: subject.travel.startTime,
            endTime: subject.travel.endTime,
            duration: subject.travel.duration,
            to: subject.travel.to,
            kind: subject.travel.kind,
        });
        // forma, singolo, colpo al km 11: la composizione tira prima del risorteggio
        expect(chance.drawn).toEqual([0, 0, 0]);
        expect(activeTravel.ambush.km).toBe(11);
        expect(activeTravel.ambush.attempts).toBe(0);
        expect(ambushJobs()).toEqual([
            expect.objectContaining({
                options: expect.objectContaining({
                    jobId: ambushJobId(
                        subject.characterId,
                        START,
                        activeTravel.ambush.at,
                    ),
                }),
            }),
        ]);
    });

    it('holds the report in the travel until arrival (D-13)', async () => {
        const subject = await traveller({ km: 10 });
        chance.load([0, 0]);

        await service.resolve(subject.identity);

        const { activeTravel } = (await rawOf(subject)).status;
        expect(activeTravel.ambushReports).toHaveLength(1);
        expect(activeTravel.ambushReports[0]).toEqual(
            expect.objectContaining({
                outcome: QuestOutcome.success,
                at: subject.identity.at,
                nearCity: { id: map.cities.crocevia, name: 'Crocevia' },
                reachedCity: null,
                user: subject.player.user._id,
                enemies: [{ enemy: enemies.wolf, quantity: 1 }],
                xpGained: 40 + WOLF_XP,
            }),
        );
        expect(await world.models.questResults.countDocuments()).toBe(0);
    });

    it('raises the equipped companion and holds its gain in the report on a won ambush (D-04, D-19)', async () => {
        const { subject, companion, ownedPets } =
            await travellerWithCompanion();
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const raw = await rawOf(subject);
        expect(raw.assets.ownedPets).toEqual([
            ownedPets[0],
            {
                pet: companion,
                xp: COMPANION_SHARE,
                currentLifePoints: COMPANION_LIFE,
            },
        ]);
        expect(raw.status.xp).toBe(40 + COMPANION_WOLF_XP);
        expect(raw.status.activeTravel.ambushReports.at(-1).petXpGained).toBe(
            COMPANION_SHARE,
        );
    });

    it('stops redrawing with less than ten km left and re-enqueues the arrival (D-03, D-13)', async () => {
        const subject = await traveller({ km: 15 });
        moveClockTo(new Date(subject.travel.endTime as Date));
        clock.advanceSeconds(ONE_MINUTE_S);
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const { activeTravel } = (await rawOf(subject)).status;
        expect(activeTravel.ambush).toBeNull();
        expect(ambushJobs()).toEqual([]);
        expect(
            travelQueue.added.filter((job) => job.name === 'complete'),
        ).toEqual([
            expect.objectContaining({
                options: expect.objectContaining({
                    jobId: travelJobId(subject.characterId, START),
                }),
            }),
        ]);
    });

    it('fights the city habitat near a city marker (D-07)', async () => {
        const subject = await traveller({ km: 1 });
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const report = (await rawOf(subject)).status.activeTravel
            .ambushReports[0];
        expect(report.nearCity).toEqual({ id: map.cities.alba, name: 'Alba' });
        expect(report.enemies).toEqual([
            { enemy: enemies.bandit, quantity: 1 },
        ]);
    });

    it('skips a non composable ambush and redraws (D-08)', async () => {
        const subject = await traveller({ km: 10, xp: LEVEL_TWENTY_XP });
        const before = await rawOf(subject);

        expect(await skippedLogsOf(subject)).toContainEqual(
            expect.stringContaining('risolta: skipped (pool non componibile)'),
        );

        const raw = await rawOf(subject);
        expect(raw.status.currentLifePoints).toBe(
            before.status.currentLifePoints,
        );
        expect(raw.status.coins).toEqual(before.status.coins);
        expect(raw.status.xp).toBe(LEVEL_TWENTY_XP);
        expect(raw.status.activeTravel.ambushReports ?? []).toEqual([]);
        expect(combat.contexts).toEqual([]);
        // fallback 0.99: nessun colpo sui km residui
        expect(raw.status.activeTravel.ambush).toBeNull();
    });

    it('skips an ownerless traveller without any redraw (D-08)', async () => {
        const subject = await traveller({ km: 10 });
        await world.harness.connection.collection('users').deleteMany({});
        chance.load([0, 0, 0]);

        expect(await skippedLogsOf(subject)).toContainEqual(
            expect.stringContaining(
                'risolta: skipped (personaggio senza proprietario)',
            ),
        );

        const raw = await rawOf(subject);
        expect(raw.status.activeTravel.ambush).toBeNull();
        expect(raw.status.activeTravel.ambushReports ?? []).toEqual([]);
        expect(combat.contexts).toEqual([]);
        expect(ambushJobs()).toEqual([]);
    });

    it('names the city of the nearest marker when the nearest POI has no city (D-06)', async () => {
        await world.harness.connection
            .collection('pointsofinterest')
            .updateOne({ _id: map.forestPoi }, { $set: { city: null } });
        await world.harness.connection
            .collection('cities')
            .updateOne(
                { _id: map.cities.crocevia },
                { $set: { pointsOfInterest: [map.markers.crocevia] } },
            );
        const subject = await traveller({ km: 10 });
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const report = (await rawOf(subject)).status.activeTravel
            .ambushReports[0];
        expect(report.nearCity).toEqual({
            id: map.cities.crocevia,
            name: 'Crocevia',
        });
        expect(report.enemies).toEqual([{ enemy: enemies.wolf, quantity: 1 }]);
    });

    it('ignores a duplicate, early or stale trigger (D-05)', async () => {
        const subject = await traveller({ km: 10 });
        const before = await rawOf(subject);
        const shifted = {
            ...subject.identity,
            at: new Date(subject.identity.at.getTime() + 1),
        };
        await expect(service.resolve(shifted)).resolves.toBe('stale');

        const now = clock.now();
        moveClockTo(new Date(subject.identity.at.getTime() - 1000));
        await expect(service.resolve(subject.identity)).resolves.toBe('stale');
        expect(await rawOf(subject)).toEqual(before);

        moveClockTo(now);
        chance.load([0, 0]);
        await expect(service.resolve(subject.identity)).resolves.toBe('won');
        await expect(service.resolve(subject.identity)).resolves.toBe('stale');
        const raw = await rawOf(subject);
        expect(raw.status.activeTravel.ambushReports).toHaveLength(1);
        expect(combat.contexts).toHaveLength(1);
    });

    it('enqueues the spell recoveries at the ambush instant (D-20)', async () => {
        const spell = await persistSpell(world.models.spells, {
            recoveryTime: RECOVERY_MS,
            maxUsages: 2,
        });
        const subject = await traveller({
            km: 10,
            characterOverrides: {
                status: {
                    spellStates: spellStatesOf([
                        { spell: spell._id, usages: 2, active: true },
                    ]),
                },
            },
        });
        chance.load([0, 0]);
        combat.willResolve(subject.characterId, {
            spellsUsed: [{ spellId: String(spell._id), usages: 1 }],
        });

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const dueAt = new Date(subject.identity.at.getTime() + RECOVERY_MS);
        expect(world.spellQueue.added).toEqual([
            expect.objectContaining({
                data: {
                    characterId: String(subject.characterId),
                    spellId: String(spell._id),
                    dueAt: dueAt.getTime(),
                },
            }),
        ]);
    });

    it('spends the active spell states in a won ambush (D-07)', async () => {
        const equipped = await persistSpell(world.models.spells, {
            recoveryTime: RECOVERY_MS,
            maxUsages: 2,
        });
        const idle = await persistSpell(world.models.spells, {
            recoveryTime: RECOVERY_MS,
            maxUsages: 2,
        });
        const subject = await traveller({
            km: 10,
            characterOverrides: {
                status: {
                    spellStates: spellStatesOf([
                        { spell: idle._id, usages: 2 },
                        { spell: equipped._id, usages: 2, active: true },
                    ]),
                },
            },
        });
        chance.load([0, 0]);
        combat.willResolve(subject.characterId, {
            spellsUsed: [
                { spellId: String(idle._id), usages: 1 },
                { spellId: String(equipped._id), usages: 1 },
            ],
        });

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        const dueAt = new Date(subject.identity.at.getTime() + RECOVERY_MS);
        const raw = await rawOf(subject);
        expect(raw.status.spellStates).toEqual([
            { spell: idle._id, usages: 2, recoveries: [], active: false },
            {
                spell: equipped._id,
                usages: 1,
                recoveries: [dueAt],
                active: true,
            },
        ]);
    });

    it('never pushes on a victory (D-12)', async () => {
        const subject = await traveller({ km: 10 });
        await registerDevice(world.harness, subject.player);
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        expect(world.push.sent).toEqual([]);
    });

    describe('defeat', () => {
        const completeJobs = () =>
            travelQueue.added.filter((job) => job.name === 'complete');

        it('loses with at least one life point and no aid (D-11)', async () => {
            const subject = await traveller({ km: 10 });
            const before = await rawOf(subject);
            defeatOf(subject, [InjuryType.brokenLeftArm]);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const raw = await rawOf(subject);
            expect(raw.status.currentLifePoints).toBe(1);
            expect(raw.status.injuries).toContain(InjuryType.brokenLeftArm);
            expect(raw.status.awaitingAid ?? null).toBeNull();
            expect(raw.status.xp).toBe(before.status.xp);
            expect(raw.status.coins).toEqual(before.status.coins);
        });

        it('awards no companion xp on a lost ambush (D-04)', async () => {
            const { subject, ownedPets } = await travellerWithCompanion();
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const raw = await rawOf(subject);
            expect(raw.assets.ownedPets).toEqual(ownedPets);
            expect(
                raw.status.activeTravel.ambushReports.at(-1).petXpGained,
            ).toBe(0);
        });

        it('rewrites the travel from the point towards the nearest city by road (D-11)', async () => {
            const subject = await traveller({ km: 10 });
            const oldJob = travelJobId(subject.characterId, START);
            await travelQueue.add('complete', {}, { jobId: oldJob });
            travelQueue.added.length = 0;
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            const point = (subject.travel.road as { coordinates: number[][] })
                .coordinates;
            expect(activeTravel.to).toEqual(map.markers.crocevia);
            expect(activeTravel.kind).toBe('free');
            expect(activeTravel.startTime).toEqual(subject.identity.at);
            expect(activeTravel.road.coordinates[0][0]).toBeCloseTo(0, 6);
            expect(activeTravel.road.coordinates[0][1]).toBeCloseTo(4.4966, 3);
            expect(activeTravel.road.coordinates[0]).not.toEqual(point[1]);
            expect(Object.keys(activeTravel)).not.toContain('ambush');
            expect(travelQueue.removed).toEqual([oldJob]);
            expect(completeJobs()).toEqual([
                expect.objectContaining({
                    options: expect.objectContaining({
                        jobId: travelJobId(
                            subject.characterId,
                            subject.identity.at,
                        ),
                    }),
                }),
            ]);
            expect(ambushJobs()).toEqual([]);
        });

        it('keeps heading to the destination when it is the nearest city (D-11, D-12)', async () => {
            const subject = await traveller({ km: 16 });
            await registerDevice(world.harness, subject.player);
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            expect(activeTravel.to).toEqual(map.markers.borgo);
            expect(world.push.sent).toHaveLength(1);
            expect(world.push.sent[0].message.body).toBe(
                'Sei stato sconfitto: la via torna verso Borgo',
            );
        });

        it('answers a zero length detour from the departure city (D-11)', async () => {
            const subject = await traveller({ km: 1 });
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            expect(activeTravel.to).toEqual(map.markers.alba);
            expect(activeTravel.endTime).toEqual(subject.identity.at);
            expect(activeTravel.duration).toBe(0);
            expect(completeJobs()).toEqual([
                expect.objectContaining({
                    options: expect.objectContaining({ delay: 0 }),
                }),
            ]);
        });

        // nessuna ferita reale vale 0,5: la gamba rotta dà movementImpairment 0,8 (piano 05)
        it('slows the detour with the new wounds (D-11)', async () => {
            const sound = await traveller({ km: 10 });
            defeatOf(sound);
            await service.resolve(sound.identity);
            const wounded = await traveller({ km: 10 });
            defeatOf(wounded, [InjuryType.brokenLeftLeg]);

            await expect(service.resolve(wounded.identity)).resolves.toBe(
                'lost',
            );

            const soundDuration = (await rawOf(sound)).status.activeTravel
                .duration as number;
            const woundedDuration = (await rawOf(wounded)).status.activeTravel
                .duration as number;
            expect(soundDuration).toBeGreaterThan(0);
            expect(woundedDuration).toBeCloseTo(soundDuration / 0.8, -1);
        });

        it('abandons the standard quest and frees its seat (D-11)', async () => {
            const subject = await traveller({ km: 10 });
            const quest = await persistQuest(
                world.models.quests,
                buildQuest({
                    registeredAdventurers: [
                        {
                            character: subject.characterId,
                            title: TitleType.rookie,
                        },
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
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const raw = await rawOf(subject);
            expect(raw.quests.pendingQuest).toBeNull();
            expect(raw.status.activeTravel.kind).toBe('free');
            expect(
                await world.models.pendingQuests.countDocuments({
                    _id: pending._id,
                }),
            ).toBe(0);
            const seats = (
                await world.models.quests.findById(quest._id).lean<any>().exec()
            ).registeredAdventurers;
            expect(seats).toEqual([]);
        });

        it('keeps the food eaten and charges nothing on the detour (D-11)', async () => {
            const food = await persistFood(world.models.lootItems, 5);
            const subject = await traveller({
                km: 10,
                characterOverrides: {
                    assets: { ownedItems: [foodStack(food, 2)] },
                },
            });
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const raw = await rawOf(subject);
            expect(raw.assets.ownedItems).toEqual([foodStack(food, 2)]);
            expect(raw.status.currentLifePoints).toBe(1);
        });

        it('carries the held reports into the rewritten travel (D-13)', async () => {
            const held = await traveller({ km: 10 });
            chance.load([0, 0]);
            await service.resolve(held.identity);
            const heldReport = (await rawOf(held)).status.activeTravel
                .ambushReports[0];
            const subject = await traveller({ km: 10, reports: [heldReport] });
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { ambushReports } = (await rawOf(subject)).status
                .activeTravel;
            expect(ambushReports).toHaveLength(2);
            expect(ambushReports[0].outcome).toBe(QuestOutcome.success);
            expect(ambushReports[1].outcome).toBe(QuestOutcome.failure);
            expect(ambushReports[1].reachedCity).toEqual({
                id: map.cities.crocevia,
                name: 'Crocevia',
            });
        });

        it('pushes every defeat to the owner after the commit (D-12)', async () => {
            const subject = await traveller({ km: 10 });
            await registerDevice(world.harness, subject.player);
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            expect(world.push.sent).toHaveLength(1);
            expect(world.push.sent[0].message).toMatchObject({
                type: 'ambushDefeat',
                id: subject.characterId.toHexString(),
                title: 'Imboscata!',
                body: 'Sei stato sconfitto: la via torna verso Crocevia',
            });
        });

        it('never draws an ambush on the detour (D-03)', async () => {
            const subject = await traveller({ km: 10 });
            chance.load([0, 0, 0, 0, 0]);
            combat.willEnd('failure').willResolve(subject.characterId, {
                hpAfter: 0,
            });

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            expect(Object.keys(activeTravel).sort()).toEqual([
                'ambushReports',
                'duration',
                'endTime',
                'kind',
                'road',
                'startTime',
                'to',
            ]);
            expect(ambushJobs()).toEqual([]);
        });

        it('keeps heading to the destination without a city reachable by road (D-25)', async () => {
            const subject = await traveller({ km: 10 });
            await registerDevice(world.harness, subject.player);
            await world.harness.connection.collection('roads').deleteMany({});
            await world.harness.app.get(RoadsService).buildGraph();
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            const { activeTravel } = (await rawOf(subject)).status;
            const original = (
                subject.travel.road as { coordinates: number[][] }
            ).coordinates;
            expect(activeTravel.to).toEqual(map.markers.borgo);
            expect(activeTravel.kind).toBe('free');
            expect(activeTravel.startTime).toEqual(subject.identity.at);
            expect(activeTravel.road.coordinates[0][1]).toBeCloseTo(4.4966, 3);
            expect(activeTravel.road.coordinates.slice(1)).toEqual(
                original.slice(1),
            );
            expect(activeTravel.ambushReports[0].reachedCity).toEqual({
                id: map.cities.borgo,
                name: 'Borgo',
            });
            expect(world.push.sent[0].message.body).toBe(
                'Sei stato sconfitto: la via torna verso Borgo',
            );
        });
    });

    describe('progressive food (Phase 20)', () => {
        // 400 km, 280 coperti da 28 cibi da 20 power, 120 scoperti: fame 7260 sull'intero tratto (piano 05)
        const LONG_PLAN = {
            needed: 800,
            uncoveredKm: 120,
            coveredKm: 280,
            hpLostTotal: 7260,
            settledKm: 0,
            foodConsumedAt: null,
        };
        let F20: { _id: unknown };

        const longTraveller = (km: number): Promise<Traveller> =>
            traveller({
                km,
                distanceKm: 400,
                durationMs: 144_000_000,
                food: LONG_PLAN,
                characterOverrides: {
                    assets: { ownedItems: [foodStack(F20, 28)] },
                },
            });

        const entryLifeOf = (index = 0): number | undefined =>
            combat.contexts[index].participants[0].currentLifePoints;

        beforeEach(async () => {
            F20 = await persistFood(world.models.lootItems, 20);
        });

        it('fights with the exact life of the ambush kilometre and keeps the plan on a victory (D-07, D-16, D-18)', async () => {
            const subject = await longTraveller(290);
            chance.load([0, 0]);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            expect(entryLifeOf()).toBe(945);
            const raw = await rawOf(subject);
            expect(raw.status.currentLifePoints).toBe(945);
            expect(raw.assets.ownedItems).toEqual([]);
            expect(raw.status.activeTravel.food.settledKm).toBe(290);
            expect(raw.status.activeTravel.food.foodConsumedAt).toEqual(
                clock.now(),
            );
            expect(raw.status.activeTravel.food.uncoveredKm).toBe(120);
            expect(raw.status.activeTravel.ambushReports[0].hpBefore).toBe(945);
        });

        it('builds the boundary meal from the food catalog read in session (D-14)', async () => {
            const subject = await traveller({
                km: 290,
                distanceKm: 400,
                durationMs: 144_000_000,
                food: LONG_PLAN,
            });
            const loader = world.harness.app.get(ResolutionLoader);
            const original = loader.readCombatCatalog.bind(loader);
            jest.spyOn(loader, 'readCombatCatalog').mockImplementationOnce(
                async (...args) => {
                    await world.models.characters.updateOne(
                        { _id: subject.characterId },
                        { $set: { 'assets.ownedItems': [foodStack(F20, 28)] } },
                    );
                    return original(...args);
                },
            );
            chance.load([0, 0]);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            expect(entryLifeOf()).toBe(945);
            const raw = await rawOf(subject);
            expect(raw.assets.ownedItems).toEqual([]);
            expect(raw.status.activeTravel.food.uncoveredKm).toBe(120);
        });

        it('logs the rewritten curve of a short pantry after the commit (D-19)', async () => {
            const subject = await traveller({
                km: 290,
                distanceKm: 400,
                durationMs: 144_000_000,
                food: LONG_PLAN,
                characterOverrides: {
                    assets: { ownedItems: [foodStack(F20, 14)] },
                },
            });
            const warn = jest
                .spyOn(Logger.prototype, 'warn')
                .mockImplementation(() => undefined);
            chance.load([0, 0]);

            try {
                await expect(service.resolve(subject.identity)).resolves.toBe(
                    'won',
                );
                const raw = await rawOf(subject);
                expect(raw.status.activeTravel.food.uncoveredKm).toBe(260);
                expect(
                    warn.mock.calls.map(([message]) => String(message)),
                ).toEqual([
                    `Viaggio del personaggio ${subject.characterId.toHexString()}: cibo cambiato al confine, km scoperti 120 → 260`,
                ]);
            } finally {
                warn.mockRestore();
            }
        });

        it('eats only the food of the travelled kilometres on a defeat and detours without a plan (D-03, D-04)', async () => {
            const subject = await longTraveller(30);
            defeatOf(subject);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'lost',
            );

            expect(entryLifeOf()).toBe(1000);
            const raw = await rawOf(subject);
            expect(raw.assets.ownedItems).toEqual([foodStack(F20, 25)]);
            expect(raw.status.currentLifePoints).toBe(1);
            expect(Object.keys(raw.status.activeTravel)).not.toContain('food');
        });

        it('fights a legacy travel without a plan with the life it has (D-11)', async () => {
            const subject = await traveller({ km: 10, hp: 700 });
            const before = await rawOf(subject);
            chance.load([0, 0]);

            await expect(service.resolve(subject.identity)).resolves.toBe(
                'won',
            );

            expect(entryLifeOf()).toBe(700);
            const raw = await rawOf(subject);
            expect(raw.status.activeTravel.food).toBeUndefined();
            expect(raw.assets.ownedItems).toEqual(before.assets.ownedItems);
        });
    });
});
