import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import { buildCharacter, buildQuest } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { AID_TIMEOUT_MS } from './aid/aid-timeout';
import { buildAidQuest } from './aid/aid-quest';
import { RescueResolutionService } from './rescue-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const SEVEN_DAYS_AGO = new Date(NOW.getTime() - AID_TIMEOUT_MS);
const ALREADY_CONCLUDED = new Date('2026-10-24T08:00:00.000Z');

interface TimeoutWorld {
    aidId: Types.ObjectId;
    injured: TestPlayer;
    injuredId: Types.ObjectId;
}

describe('RescueResolutionService.timeoutAid (replSet)', () => {
    let world: OutcomeHarness;
    let service: RescueResolutionService;
    let log: jest.SpyInstance;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance });
        service = world.harness.app.get(RescueResolutionService);
    });

    beforeEach(async () => {
        await world.reset();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    // ferito X in attesa di soccorso dalla aid A, nessun soccorritore registrato
    async function timeoutWorld(
        since: Date = SEVEN_DAYS_AGO,
    ): Promise<TimeoutWorld> {
        seq += 1;
        const original = await world.models.quests.create(
            buildQuest({
                infos: {
                    ...buildQuest().infos,
                    type: 'enemy',
                    title: 'Il bandito del passo',
                },
            }),
        );
        const aidId = new Types.ObjectId();
        const injured = await createPlayer(world.harness, {
            twitchId: `tw-timeout-${seq}`,
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
        const injuredId = injured.character!._id as Types.ObjectId;
        await registerDevice(world.harness, injured);
        await world.models.quests.create(
            buildAidQuest(original.toObject() as never, [injuredId], aidId),
        );
        return { aidId, injured, injuredId };
    }

    const timeout = ({ aidId }: TimeoutWorld) =>
        service.timeoutAid({ aidQuestId: aidId });

    const characterOf = (id: unknown) =>
        world.models.characters.findById(id).lean<any>();

    const aidOf = ({ aidId }: TimeoutWorld) =>
        world.models.quests.findById(aidId).lean<any>();

    async function expectUntouched(subject: TimeoutWorld): Promise<void> {
        const injured = await characterOf(subject.injuredId);
        expect(injured.deletedAt ?? null).toBeNull();
        expect(String(injured.status.awaitingAid.aidQuest)).toBe(
            String(subject.aidId),
        );
        expect((await aidOf(subject)).concludedAt).toBeNull();
        expect(await world.models.questResults.countDocuments()).toBe(0);
        expect(world.push.sent).toHaveLength(0);
    }

    it('kills the injured after seven days without a rescue', async () => {
        const subject = await timeoutWorld();

        await expect(timeout(subject)).resolves.toBe('resolved');

        const injured = await characterOf(subject.injuredId);
        expect(injured.deletedAt).toEqual(NOW);
        expect(injured.deletionReason).toBe('death');
        const user = await world.models.users
            .findById(subject.injured.user._id)
            .lean<any>();
        expect(user.currentCharacter).toBeNull();
        const results = await world.models.questResults
            .find({ character: subject.injuredId })
            .lean<any[]>();
        expect(results).toEqual([
            expect.objectContaining({ outcome: 'death' }),
        ]);
        expect(String(results[0].user)).toBe(String(subject.injured.user._id));
        expect(String(results[0].quest.id)).toBe(String(subject.aidId));
        expect((await aidOf(subject)).concludedAt).toEqual(NOW);
        expect(
            world.push.sent
                .filter(
                    ({ message }) => message.type === PushEventType.questEnd,
                )
                .map(({ tokens, message }) => [tokens, message.id]),
        ).toEqual([
            [
                [`tok-${String(subject.injured.user._id)}`],
                String(results[0]._id),
            ],
        ]);
    });

    it('kills every wounded of a group aid after seven days without a rescue', async () => {
        const subject = await timeoutWorld();
        seq += 1;
        const other = await createPlayer(world.harness, {
            twitchId: `tw-timeout-${seq}`,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    awaitingAid: {
                        quest: new Types.ObjectId(),
                        aidQuest: subject.aidId,
                        since: new Date(SEVEN_DAYS_AGO.getTime() + 1),
                    },
                },
            },
        });
        const otherId = other.character!._id as Types.ObjectId;
        await registerDevice(world.harness, other);
        await world.models.quests.updateOne(
            { _id: subject.aidId },
            { $push: { 'rescue.characters': otherId } },
        );

        await expect(timeout(subject)).resolves.toBe('resolved');

        for (const id of [subject.injuredId, otherId]) {
            const dead = await characterOf(id);
            expect(dead.deletedAt).toEqual(NOW);
            expect(dead.deletionReason).toBe('death');
        }
        const results = await world.models.questResults.find().lean<any[]>();
        expect(results).toHaveLength(2);
        expect(results.map(({ outcome }) => outcome)).toEqual([
            'death',
            'death',
        ]);
        expect(results.map(({ quest }) => String(quest.id))).toEqual([
            String(subject.aidId),
            String(subject.aidId),
        ]);
        expect(
            results.map(({ character }) => String(character)).sort(),
        ).toEqual([String(subject.injuredId), String(otherId)].sort());
        expect((await aidOf(subject)).concludedAt).toEqual(NOW);
        expect(
            world.push.sent
                .filter(
                    ({ message }) => message.type === PushEventType.questEnd,
                )
                .flatMap(({ tokens }) => tokens)
                .sort(),
        ).toEqual(
            [
                `tok-${String(subject.injured.user._id)}`,
                `tok-${String(other.user._id)}`,
            ].sort(),
        );
    });

    it('waits until the seven days are over', async () => {
        const subject = await timeoutWorld(
            new Date(SEVEN_DAYS_AGO.getTime() + 1),
        );

        await expect(timeout(subject)).resolves.toBe('waiting');

        await expectUntouched(subject);
    });

    it('does not let a rescue time out while a rescuer is registered (C5)', async () => {
        const subject = await timeoutWorld();
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

        await expect(timeout(subject)).resolves.toBe('waiting');

        await expectUntouched(subject);
    });

    it('logs a suspended timeout at debug level only, since the sweep retries it every tick', async () => {
        const subject = await timeoutWorld();
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
        const debug = jest
            .spyOn(Logger.prototype, 'debug')
            .mockImplementation(() => undefined);

        await timeout(subject);
        await timeout(subject);

        const suspended = (calls: unknown[][]) =>
            calls.filter(([message]) =>
                String(message).includes('timeout sospeso'),
            );
        expect(suspended(log.mock.calls)).toHaveLength(0);
        expect(suspended(debug.mock.calls)).toHaveLength(2);
    });

    it('turns a second timeout into a no-op', async () => {
        const subject = await timeoutWorld();

        await timeout(subject);
        await expect(timeout(subject)).resolves.toBe('stale');

        expect(await world.models.questResults.countDocuments()).toBe(1);
        expect(world.push.sent).toHaveLength(1);
    });

    it('ignores an aid that is already concluded', async () => {
        const subject = await timeoutWorld();
        await world.models.quests.updateOne(
            { _id: subject.aidId },
            { $set: { concludedAt: ALREADY_CONCLUDED } },
        );

        await expect(timeout(subject)).resolves.toBe('stale');

        const injured = await characterOf(subject.injuredId);
        expect(injured.deletedAt ?? null).toBeNull();
        expect(await world.models.questResults.countDocuments()).toBe(0);
    });

    it('ignores an aid without a rescue reference', async () => {
        const subject = await timeoutWorld();
        await world.models.quests.updateOne(
            { _id: subject.aidId },
            { $set: { rescue: null } },
        );

        await expect(timeout(subject)).resolves.toBe('stale');

        const injured = await characterOf(subject.injuredId);
        expect(injured.deletedAt ?? null).toBeNull();
        expect(await world.models.questResults.countDocuments()).toBe(0);
    });

    it('concludes the aid without a death when the injured is already unlinked', async () => {
        const subject = await timeoutWorld();
        await world.models.users.updateOne(
            { _id: subject.injured.user._id },
            { $set: { currentCharacter: null } },
        );

        await expect(timeout(subject)).resolves.toBe('resolved');

        expect((await aidOf(subject)).concludedAt).toEqual(NOW);
        expect(await world.models.questResults.countDocuments()).toBe(0);
        const injured = await characterOf(subject.injuredId);
        expect(injured.deletedAt ?? null).toBeNull();
        expect(world.push.sent).toHaveLength(0);
        expect(
            log.mock.calls
                .map(([message]) => String(message))
                .some((message) => message.includes(String(subject.injuredId))),
        ).toBe(true);
    });
});
