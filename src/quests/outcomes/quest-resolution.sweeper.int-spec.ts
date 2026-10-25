import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistEnemy,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    OUTCOME_WAITING_TIME_MS,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    QUIET_SWEEP_CONFIG,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { QuestLane } from '../acceptance/quest-lanes';
import { AID_TIMEOUT_MS } from './aid/aid-timeout';
import { buildAidQuest } from './aid/aid-quest';
import { QuestResolutionSweeper } from './quest-resolution.sweeper';

// OUTCOME_START + OUTCOME_WAITING_TIME_MS: le corsie standard del fixture sono appena scadute
const NOW = new Date(OUTCOME_START.getTime() + OUTCOME_WAITING_TIME_MS);
const HALF_HOUR_MS = 30 * 60 * 1000;
const EIGHT_DAYS_AGO = new Date(NOW.getTime() - AID_TIMEOUT_MS - 86_400_000);
const ONE_SEAT = [{ title: null, count: 1 }];
const NOTHING_DONE = { resolved: 0, timedOut: 0 };

describe('QuestResolutionSweeper (replSet)', () => {
    let world: OutcomeHarness;
    let sweeper: QuestResolutionSweeper;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const combat = new ScriptedCombatResolver();

    beforeAll(async () => {
        // sweeper vero: solo lo sweep periodico è spento, il test chiama sweep() a mano
        world = await createOutcomeHarness({
            clock,
            chance,
            combat,
            quiet: [QUIET_SWEEP_CONFIG],
        });
        sweeper = world.harness.app.get(QuestResolutionSweeper);
        // single-flight: attende il reconciler del boot prima del primo setup
        await sweeper.sweep();
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        combat.reset();
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function quester(
        options: Partial<QuesterOptions> = {},
    ): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-sweeper-${seq}`,
            questOverrides: {
                infos: { ...buildQuest().infos, type: 'job' },
                prizes: { ...buildQuest().prizes, randomLoot: [] },
            },
            ...options,
        });
    }

    async function hunter(): Promise<Quester> {
        const foe = await persistEnemy(world.models.enemies, { xp: 100 });
        const subject = await quester({
            questOverrides: {
                infos: {
                    ...buildQuest().infos,
                    type: 'hunt',
                    enemy: foe._id,
                },
                requirements: {
                    ...buildQuest().requirements,
                    requiredAdventurers: ONE_SEAT,
                },
                prizes: { ...buildQuest().prizes, randomLoot: [] },
            },
        });
        combat.willEnd('success');
        return subject;
    }

    function gmLane(lane: QuestLane, type: string): Promise<Quester> {
        return quester({
            lane,
            waitingTime: 0,
            questOverrides: { infos: { ...buildQuest().infos, type } },
        });
    }

    // ferito in attesa dalla aid, eventualmente con un soccorritore registrato
    async function injured(since: Date = EIGHT_DAYS_AGO) {
        seq += 1;
        const original = await world.models.quests.create(
            buildQuest({ infos: { ...buildQuest().infos, type: 'enemy' } }),
        );
        const aidId = new Types.ObjectId();
        const player = await createPlayer(world.harness, {
            twitchId: `tw-sweeper-${seq}`,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    awaitingAid: {
                        quest: original._id,
                        aidQuest: aidId,
                        since,
                    },
                },
            },
        });
        const id = player.character!._id as Types.ObjectId;
        await world.models.quests.create(
            buildAidQuest(original.toObject() as never, id, aidId),
        );
        return { id, aidId };
    }

    const characterOf = (id: unknown) =>
        world.models.characters.findById(id).lean<any>();

    const resultsOf = (id: unknown) =>
        world.models.questResults.find({ character: id }).lean<any[]>();

    async function expectUntouched(
        subject: Quester,
        lane: QuestLane = QuestLane.standard,
    ): Promise<void> {
        expect(
            String((await characterOf(subject.characterId)).quests[lane]),
        ).toBe(String(subject.pendingQuest._id));
        expect(
            await world.models.pendingQuests.exists({
                _id: subject.pendingQuest._id,
            }),
        ).toBeTruthy();
        expect(await resultsOf(subject.characterId)).toEqual([]);
    }

    it('resolves only the due standard quests', async () => {
        const job = await quester();
        const hunt = await hunter();
        const notDue = await quester({
            startDate: new Date(NOW.getTime() - HALF_HOUR_MS),
        });

        await expect(sweeper.sweep()).resolves.toEqual({
            resolved: 2,
            timedOut: 0,
        });

        for (const subject of [job, hunt]) {
            expect(await resultsOf(subject.characterId)).toEqual([
                expect.objectContaining({ outcome: 'success' }),
            ]);
            expect(
                await world.models.pendingQuests.exists({
                    _id: subject.pendingQuest._id,
                }),
            ).toBeNull();
        }
        await expectUntouched(notDue);
    });

    it('never resolves the story and world mission lanes (Pitfall 2)', async () => {
        const story = await gmLane(QuestLane.story, 'story');
        const worldMission = await gmLane(
            QuestLane.worldMission,
            'worldMission',
        );

        await expect(sweeper.sweep()).resolves.toEqual(NOTHING_DONE);

        await expectUntouched(story, QuestLane.story);
        await expectUntouched(worldMission, QuestLane.worldMission);
    });

    it('leaves a standard quest still on the road untouched', async () => {
        const travelling = await quester({ startDate: null });

        await expect(sweeper.sweep()).resolves.toEqual(NOTHING_DONE);

        await expectUntouched(travelling);
    });

    it('times out a rescue nobody took after seven days', async () => {
        const subject = await injured();

        await expect(sweeper.sweep()).resolves.toEqual({
            resolved: 0,
            timedOut: 1,
        });

        expect((await characterOf(subject.id)).deletionReason).toBe('death');
        expect(await resultsOf(subject.id)).toEqual([
            expect.objectContaining({ outcome: 'death' }),
        ]);
    });

    it('does not time out a rescue with a registered rescuer (C5)', async () => {
        const subject = await injured();
        await world.models.quests.updateOne(
            { _id: subject.aidId },
            {
                $push: {
                    registeredAdventurers: {
                        character: new Types.ObjectId(),
                        title: 'rookie',
                    },
                },
            },
        );

        await expect(sweeper.sweep()).resolves.toEqual(NOTHING_DONE);

        expect((await characterOf(subject.id)).deletedAt ?? null).toBeNull();
        expect(await resultsOf(subject.id)).toEqual([]);
    });

    it('finds nothing left on a second sweep', async () => {
        await quester();
        await injured();

        await expect(sweeper.sweep()).resolves.toEqual({
            resolved: 1,
            timedOut: 1,
        });
        await expect(sweeper.sweep()).resolves.toEqual(NOTHING_DONE);
    });
});
