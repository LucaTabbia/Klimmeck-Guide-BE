import { BullModule, getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Types } from 'mongoose';
import { SystemClock } from 'src/auth/clock';
import { TRAVEL_CONFIG } from 'src/config/travel-config';
import { RoadsService } from 'src/roads/roads.service';
import { TravelScheduler } from 'src/travel/travel-scheduler.service';
import { TRAVEL_QUEUE } from 'src/travel/travel-job';
import { TravelModule } from 'src/travel/travel.module';
import {
    createOutcomeHarness,
    type OutcomeHarness,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { startRedis, stopRedis } from '../../../test/setup/redis';
import {
    AMBUSH_ROUTE_DURATION_MS,
    AMBUSH_ROUTE_KM,
    type AmbushWorld,
    persistAmbushEnemies,
    persistAmbushWorld,
    persistTraveller,
    type Traveller,
} from '../../../test/travel/ambush-world';
import { AmbushModule } from './ambush.module';

// km 16: nessun risorteggio dopo la vittoria (D-02); [0, 0] = singolo, primo candidato; fallback 0.99 = nessun colpo
const AMBUSH_KM = 16;
const COMPOSITION_ROLLS = [0, 0];
const AMBUSH_DELAY_MS = 1_000;
const AMBUSH_OFFSET_MS = Math.floor(
    (AMBUSH_KM / AMBUSH_ROUTE_KM) * AMBUSH_ROUTE_DURATION_MS,
);
const WAIT_DEADLINE_MS = 15_000;
const POLL_STEP_MS = 100;
const NEGATIVE_WAIT_MS = 1_500;
const TEST_TIMEOUT_MS = 30_000;

const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// polling con deadline, mai la promessa di fine job di Bull (open handle, Phase 1 D-06)
async function waitFor(
    predicate: () => Promise<boolean> | boolean,
    timeoutMs = WAIT_DEADLINE_MS,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await pause(POLL_STEP_MS);
    }
    return predicate();
}

/**
 * INTEGRATION: solo la coda 'travel' su Redis effimero REALE (job 'ambush' accanto a 'complete');
 * code degli esiti e push finte con gli override di createOutcomeHarness (Pitfall 9); SystemClock reale (il delay Bull usa il tempo reale).
 */
describe('AmbushProcessor (real Redis)', () => {
    const chance = new SequenceChance([], 0.99);
    const combat = new ScriptedCombatResolver();
    let world: OutcomeHarness;
    let queue: Queue;
    let scheduler: TravelScheduler;
    let map: AmbushWorld;
    let seq = 0;

    const traveller = async (startTime: Date): Promise<Traveller> => {
        seq += 1;
        return persistTraveller(world.harness, map, {
            twitchId: `ambush-redis-${seq}`,
            km: AMBUSH_KM,
            startTime,
        });
    };

    // l'imboscata cade fra un secondo: il job Bull aspetta il suo delay reale
    const ambushedSoon = (): Promise<Traveller> =>
        traveller(new Date(Date.now() + AMBUSH_DELAY_MS - AMBUSH_OFFSET_MS));

    const rawOf = async (id: Types.ObjectId): Promise<any> =>
        world.models.characters.findById(id).lean<any>().exec();

    const reportCountOf = async (id: Types.ObjectId): Promise<number> =>
        ((await rawOf(id))?.status.activeTravel?.ambushReports ?? []).length;

    beforeAll(async () => {
        const { host, port } = await startRedis();
        world = await createOutcomeHarness({
            clock: new SystemClock(),
            chance,
            combat,
            imports: [
                BullModule.forRoot({ redis: { host, port } }),
                TravelModule,
                AmbushModule,
            ],
            overrides: [
                { token: TRAVEL_CONFIG, useValue: { sweepIntervalMs: 0 } },
            ],
        });
        queue = world.harness.app.get<Queue>(getQueueToken(TRAVEL_QUEUE));
        scheduler = world.harness.app.get(TravelScheduler);
    }, 120_000);

    beforeEach(async () => {
        await world.reset();
        combat.reset();
        chance.load([]);
        map = await persistAmbushWorld(
            world.harness.connection,
            world.harness.app.get(RoadsService),
        );
        await persistAmbushEnemies(world.harness.connection);
    });

    afterAll(async () => {
        // Redis condiviso in CI (Pitfall 6): nessun job residuo per le suite successive
        if (queue) await queue.empty();
        if (world) await world.harness.close();
        await stopRedis();
    });

    it(
        'processes the ambush job beside the travel completion on the same queue (D-05)',
        async () => {
            const ambushed = await ambushedSoon();
            const arrived = await traveller(
                new Date(Date.now() - AMBUSH_ROUTE_DURATION_MS - 1_000),
            );
            await world.models.characters
                .updateOne(
                    { _id: arrived.characterId },
                    { $set: { 'status.activeTravel.ambush': null } },
                )
                .exec();
            chance.load(COMPOSITION_ROLLS);

            await scheduler.scheduleAmbush(
                ambushed.characterId,
                ambushed.identity.startTime,
                ambushed.identity.at,
            );
            await scheduler.schedule(arrived.characterId, {
                startTime: arrived.identity.startTime,
                endTime: new Date(
                    arrived.identity.startTime.getTime() +
                        AMBUSH_ROUTE_DURATION_MS,
                ),
            });

            expect(
                await waitFor(
                    async () =>
                        (await reportCountOf(ambushed.characterId)) === 1,
                ),
            ).toBe(true);
            const { activeTravel } = (await rawOf(ambushed.characterId)).status;
            expect(activeTravel.ambush).not.toEqual(ambushed.travel.ambush);
            expect(
                await waitFor(
                    async () =>
                        (await rawOf(arrived.characterId)).status
                            .activeTravel === null,
                ),
            ).toBe(true);
            expect((await rawOf(arrived.characterId)).status.location).toEqual(
                map.markers.borgo,
            );
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'ignores a duplicated ambush job id on the real queue (D-05)',
        async () => {
            const ambushed = await ambushedSoon();
            chance.load(COMPOSITION_ROLLS);
            const { characterId, startTime, at } = ambushed.identity;

            await scheduler.scheduleAmbush(characterId, startTime, at);
            await scheduler.scheduleAmbush(characterId, startTime, at);

            expect(
                await waitFor(
                    async () => (await reportCountOf(characterId)) === 1,
                ),
            ).toBe(true);
            // asserzione negativa: nessun evento da attendere, solo una finestra fissa
            await pause(NEGATIVE_WAIT_MS);

            expect(await reportCountOf(characterId)).toBe(1);
            expect(combat.contexts).toHaveLength(1);
        },
        TEST_TIMEOUT_MS,
    );
});
