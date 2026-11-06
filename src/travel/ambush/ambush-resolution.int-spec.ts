import { toCopper } from 'src/economy/coins';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { RoadsService } from 'src/roads/roads.service';
import { travelJobId } from 'src/travel/travel-job';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { persistSpell, spellBook } from '../../../test/fixtures';
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

    const rawOf = async (subject: Traveller): Promise<any> =>
        world.models.characters
            .findById(subject.characterId)
            .lean<any>()
            .exec();

    const ambushJobs = () =>
        travelQueue.added.filter((job) => job.name === 'ambush');

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

        await expect(service.resolve(subject.identity)).resolves.toBe(
            'skipped',
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
        const book = spellBook([{ spell: spell._id, usages: 2, active: true }]);
        const subject = await traveller({
            km: 10,
            characterOverrides: {
                status: { spells: book.spells, spellStates: book.spellStates },
                assets: { activeSpells: book.activeSpells },
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

    it('never pushes on a victory (D-12)', async () => {
        const subject = await traveller({ km: 10 });
        await registerDevice(world.harness, subject.player);
        chance.load([0, 0]);

        await expect(service.resolve(subject.identity)).resolves.toBe('won');

        expect(world.push.sent).toEqual([]);
    });
});
