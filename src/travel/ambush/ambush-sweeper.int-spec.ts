import { Logger } from '@nestjs/common';
import { RoadsService } from 'src/roads/roads.service';
import { travelJobId } from 'src/travel/travel-job';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createOutcomeHarness,
    type OutcomeHarness,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import {
    AMBUSH_ROUTE_DURATION_MS,
    type AmbushWorld,
    persistAmbushEnemies,
    persistAmbushWorld,
    persistTraveller,
    type Traveller,
} from '../../../test/travel/ambush-world';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';
import { AmbushSweeper } from './ambush-sweeper';
import { AmbushModule } from './ambush.module';
import { AMBUSH_ATTEMPT_UPDATE } from './ambush.updates';

// km 16: a 4 km dalla meta, nessun risorteggio dopo la vittoria (D-02); [0, 0] = singolo, primo candidato
const START = new Date('2026-10-21T10:00:00.000Z');
const LATER_START = new Date('2026-10-21T13:00:00.000Z');
const AMBUSH_KM = 16;
const ONE_MINUTE_MS = 60_000;
const ARRIVAL = new Date(START.getTime() + AMBUSH_ROUTE_DURATION_MS);
const COMPOSITION_ROLLS = [0, 0];

describe('AmbushSweeper (replica set)', () => {
    const clock = new FixedClock(START);
    const chance = new SequenceChance();
    const combat = new ScriptedCombatResolver();
    const travelQueue = new FakeTravelQueue();
    let world: OutcomeHarness;
    let sweeper: AmbushSweeper;
    let map: AmbushWorld;
    let errorSpy: jest.SpyInstance;
    let seq = 0;

    const moveClockTo = (instant: Date): void =>
        clock.advanceSeconds(
            (instant.getTime() - clock.now().getTime()) / 1000,
        );

    const traveller = async (startTime = START): Promise<Traveller> => {
        seq += 1;
        return persistTraveller(world.harness, map, {
            twitchId: `ambush-sweep-${seq}`,
            km: AMBUSH_KM,
            startTime,
        });
    };

    const rawOf = async (subject: Traveller): Promise<any> =>
        world.models.characters
            .findById(subject.characterId)
            .lean<any>()
            .exec();

    const reportsOf = async (subject: Traveller): Promise<unknown[]> =>
        ((await rawOf(subject)).status.activeTravel.ambushReports ??
            []) as unknown[];

    const failEveryCombat = (): void => {
        combat.willEndBy(() => {
            throw new Error('boom');
        });
    };

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            combat,
            imports: [AmbushModule],
            travelQueue,
        });
        sweeper = world.harness.app.get(AmbushSweeper);
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
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    it('reconciles the due ambushes at boot and on sweep (D-05)', async () => {
        const first = await traveller();
        const second = await traveller();
        const future = await traveller(LATER_START);
        moveClockTo(new Date(first.identity.at.getTime() + ONE_MINUTE_MS));
        chance.load([...COMPOSITION_ROLLS, ...COMPOSITION_ROLLS]);

        sweeper.onApplicationBootstrap();
        await expect(sweeper.sweep()).resolves.toBe(2);

        expect(await reportsOf(first)).toHaveLength(1);
        expect(await reportsOf(second)).toHaveLength(1);
        expect(await reportsOf(future)).toEqual([]);
        expect((await rawOf(future)).status.activeTravel.ambush).toEqual(
            future.travel.ambush,
        );
    });

    it('runs a single sweep at a time (D-05)', async () => {
        const first = await traveller();
        const second = await traveller();
        moveClockTo(new Date(first.identity.at.getTime() + ONE_MINUTE_MS));
        chance.load([...COMPOSITION_ROLLS, ...COMPOSITION_ROLLS]);

        const one = sweeper.sweep();
        const other = sweeper.sweep();

        expect(other).toBe(one);
        await expect(Promise.all([one, other])).resolves.toEqual([2, 2]);
        expect(await reportsOf(first)).toHaveLength(1);
        expect(await reportsOf(second)).toHaveLength(1);
    });

    it('counts a failed resolution as an attempt (D-18)', async () => {
        const subject = await traveller();
        moveClockTo(new Date(subject.identity.at.getTime() + ONE_MINUTE_MS));
        chance.load(COMPOSITION_ROLLS);
        failEveryCombat();

        await expect(sweeper.sweep()).resolves.toBe(0);

        const { ambush } = (await rawOf(subject)).status.activeTravel;
        expect(ambush.attempts).toBe(1);
        expect(ambush.at).toEqual(subject.identity.at);
        expect(await reportsOf(subject)).toEqual([]);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('(tentativo 1)'),
        );
        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('boom'),
        );
    });

    it('keeps sweeping when recording a failure throws (D-18)', async () => {
        const broken = await traveller();
        const healthy = await traveller();
        moveClockTo(new Date(broken.identity.at.getTime() + ONE_MINUTE_MS));
        chance.load([...COMPOSITION_ROLLS, ...COMPOSITION_ROLLS]);
        combat.willEndBy((context) => {
            if (
                context.participants.some(
                    (participant) =>
                        participant.characterId === String(broken.characterId),
                )
            ) {
                throw new Error('boom');
            }
            return 'success';
        });
        const characters = world.models.characters;
        const updateOne = characters.updateOne.bind(characters);
        const updateSpy = jest
            .spyOn(characters, 'updateOne')
            .mockImplementation(((...args: Parameters<typeof updateOne>) =>
                args[1] === AMBUSH_ATTEMPT_UPDATE
                    ? { exec: () => Promise.reject(new Error('driver down')) }
                    : updateOne(...args)) as never);

        try {
            await expect(sweeper.sweep()).resolves.toBe(1);
        } finally {
            updateSpy.mockRestore();
        }

        expect(await reportsOf(broken)).toEqual([]);
        expect(await reportsOf(healthy)).toHaveLength(1);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'registrazione del fallimento non riuscita',
            ),
        );
        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Sweep delle imboscate fallito'),
        );
    });

    it('cancels the ambush at the third failure and lets the travel complete (D-18)', async () => {
        const subject = await traveller();
        await world.models.characters
            .updateOne(
                { _id: subject.characterId },
                { $set: { 'status.activeTravel.ambush.attempts': 2 } },
            )
            .exec();
        moveClockTo(new Date(ARRIVAL.getTime() + ONE_MINUTE_MS));
        chance.load(COMPOSITION_ROLLS);
        failEveryCombat();

        await expect(sweeper.sweep()).resolves.toBe(0);

        const { activeTravel } = (await rawOf(subject)).status;
        expect(activeTravel.ambush).toBeNull();
        expect(activeTravel.ambushReports ?? []).toEqual([]);
        expect(
            travelQueue.added.filter((job) => job.name === 'complete'),
        ).toEqual([
            expect.objectContaining({
                options: expect.objectContaining({
                    jobId: travelJobId(subject.characterId, START),
                }),
            }),
        ]);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('annullata dopo 3 errori'),
        );
        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('boom'),
        );
    });
});
