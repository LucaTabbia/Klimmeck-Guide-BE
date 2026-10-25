import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, buildQuest } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { buildActiveTravelDoc } from '../../../test/travel/active-travel.fixture';
import { buildAidQuest } from '../outcomes/aid/aid-quest';
import { PARTY_TIMEOUT_MS } from './party-rules';
import { PartyTimeoutService } from './party-timeout.service';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const DAY_AGO = new Date(NOW.getTime() - PARTY_TIMEOUT_MS);
const HOUR_MS = 60 * 60 * 1000;
const AID_SINCE = new Date(NOW.getTime() - HOUR_MS);

describe('PartyTimeoutService.disband (replSet)', () => {
    let world: OutcomeHarness;
    let service: PartyTimeoutService;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance });
        service = world.harness.app.get(PartyTimeoutService);
    });

    beforeEach(async () => {
        await world.reset();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const bossOf = (seats: number) => ({
        infos: { ...buildQuest().infos, type: 'boss' },
        requirements: {
            ...buildQuest().requirements,
            requiredAdventurers: [{ title: null, count: seats }],
        },
    });

    async function member(
        options: Partial<QuesterOptions> & { travelling?: boolean },
    ): Promise<Quester> {
        seq += 1;
        const { travelling, ...rest } = options;
        const created = await persistQuester(world.harness, {
            twitchId: `tw-party-${seq}`,
            startDate: null,
            arrivedAt: travelling ? null : OUTCOME_START,
            ...(travelling
                ? {
                      characterOverrides: {
                          status: {
                              activeTravel: buildActiveTravelDoc({
                                  kind: 'quest',
                              }),
                          },
                      },
                  }
                : {}),
            ...rest,
        });
        await registerDevice(world.harness, created.player);
        return created;
    }

    // party in formazione: la registrazione più vecchia fissa la finestra delle 24 ore
    async function registeredSince(questId: unknown, since: Date) {
        await world.models.quests.updateOne(
            { _id: questId },
            { $set: { 'registeredAdventurers.$[].registeredAt': since } },
        );
    }

    const questOf = (id: unknown) =>
        world.models.quests.findById(id).lean<any>();

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const pendingQuestExists = async (subject: Quester) =>
        (await world.models.pendingQuests.exists({
            _id: subject.pendingQuest._id,
        })) !== null;

    const cancelledPushes = () =>
        world.push.sent.filter(
            ({ message }) => message.type === PushEventType.questCancelled,
        );

    async function expectUntouched(...members: Quester[]): Promise<void> {
        for (const subject of members) {
            expect(await pendingQuestExists(subject)).toBe(true);
            expect(
                String((await characterOf(subject)).quests.pendingQuest),
            ).toBe(String(subject.pendingQuest._id));
        }
        expect(
            (await questOf(members[0].quest._id)).registeredAdventurers,
        ).toHaveLength(members.length);
        expect(cancelledPushes()).toEqual([]);
    }

    it('disbands a party still incomplete after 24 hours', async () => {
        const waiting = await member({ questOverrides: bossOf(3) });
        const travelling = await member({
            quest: waiting.quest,
            travelling: true,
        });
        await registeredSince(waiting.quest._id, DAY_AGO);
        const questId = waiting.quest._id as Types.ObjectId;

        await expect(service.disband({ questId })).resolves.toBe('disbanded');

        const quest = await questOf(questId);
        expect(quest.registeredAdventurers).toEqual([]);
        expect(quest.concludedAt).toBeNull();
        expect(quest.startedAt).toBeNull();
        for (const subject of [waiting, travelling]) {
            expect(await pendingQuestExists(subject)).toBe(false);
            expect((await characterOf(subject)).quests.pendingQuest).toBeNull();
        }
        expect(
            (await characterOf(travelling)).status.activeTravel,
        ).not.toBeNull();
        expect(await world.models.questResults.countDocuments()).toBe(0);
        const pushes = cancelledPushes();
        expect(pushes).toHaveLength(2);
        expect(pushes.map(({ message }) => message.id)).toEqual([
            questId.toHexString(),
            questId.toHexString(),
        ]);
        expect(pushes.flatMap(({ tokens }) => tokens).sort()).toEqual(
            [
                `tok-${String(waiting.player.user._id)}`,
                `tok-${String(travelling.player.user._id)}`,
            ].sort(),
        );

        await expect(service.disband({ questId })).resolves.toBe('stale');
        expect(cancelledPushes()).toHaveLength(2);
    });

    it('keeps a full party waiting for a member still travelling', async () => {
        const waiting = await member({ questOverrides: bossOf(2) });
        const travelling = await member({
            quest: waiting.quest,
            travelling: true,
        });
        await registeredSince(waiting.quest._id, DAY_AGO);

        await expect(
            service.disband({ questId: waiting.quest._id }),
        ).resolves.toBe('waiting');

        await expectUntouched(waiting, travelling);
    });

    it('keeps a party within its 24 hours', async () => {
        const waiting = await member({ questOverrides: bossOf(3) });
        await registeredSince(
            waiting.quest._id,
            new Date(NOW.getTime() - 23 * HOUR_MS),
        );

        await expect(
            service.disband({ questId: waiting.quest._id }),
        ).resolves.toBe('waiting');

        await expectUntouched(waiting);
    });

    it('never disbands a started party', async () => {
        const started = await member({
            questOverrides: bossOf(3),
            startDate: OUTCOME_START,
        });
        await registeredSince(started.quest._id, DAY_AGO);

        await expect(
            service.disband({ questId: started.quest._id }),
        ).resolves.toBe('stale');

        await expectUntouched(started);
    });

    it('disbands the rescuers of an aid and keeps the aid open', async () => {
        seq += 1;
        const original = await world.models.quests.create(bossOf(3));
        const aidId = new Types.ObjectId();
        const injured = await createPlayer(world.harness, {
            twitchId: `tw-party-${seq}`,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    awaitingAid: {
                        quest: original._id,
                        aidQuest: aidId,
                        since: AID_SINCE,
                    },
                },
            },
        });
        const injuredId = injured.character!._id as Types.ObjectId;
        const aid = await world.models.quests.create(
            buildAidQuest(original.toObject() as never, [injuredId], aidId),
        );
        const rescuer = await member({ quest: aid });
        await registeredSince(aidId, DAY_AGO);

        await expect(service.disband({ questId: aidId })).resolves.toBe(
            'disbanded',
        );

        const after = await questOf(aidId);
        expect(after.concludedAt).toBeNull();
        expect(after.registeredAdventurers).toEqual([]);
        expect(after.rescue.characters.map(String)).toEqual([
            String(injuredId),
        ]);
        expect(
            (await world.models.characters.findById(injuredId).lean<any>())
                .status.awaitingAid,
        ).not.toBeNull();
        expect(await pendingQuestExists(rescuer)).toBe(false);
        expect(cancelledPushes()).toHaveLength(1);
    });

    it('disbands once under concurrent triggers', async () => {
        const waiting = await member({ questOverrides: bossOf(3) });
        await member({ quest: waiting.quest });
        await registeredSince(waiting.quest._id, DAY_AGO);
        const questId = waiting.quest._id as Types.ObjectId;

        const outcomes = await Promise.all([
            service.disband({ questId }),
            service.disband({ questId }),
        ]);

        expect(outcomes.sort()).toEqual(['disbanded', 'stale']);
        expect(cancelledPushes()).toHaveLength(2);
    });

    it('leaves the party alone when someone joins between the read and the claim', async () => {
        const waiting = await member({ questOverrides: bossOf(3) });
        await registeredSince(waiting.quest._id, DAY_AGO);
        const questId = waiting.quest._id as Types.ObjectId;
        const connection = world.harness.connection;
        const transaction = connection.transaction.bind(connection);
        jest.spyOn(connection, 'transaction').mockImplementationOnce(
            async (fn, options) => {
                await world.models.quests.updateOne(
                    { _id: questId },
                    {
                        $push: {
                            registeredAdventurers: {
                                character: new Types.ObjectId(),
                                title: 'rookie',
                                registeredAt: NOW,
                            },
                        },
                    },
                );
                return transaction(fn, options);
            },
        );

        await expect(service.disband({ questId })).resolves.toBe('stale');

        expect(await pendingQuestExists(waiting)).toBe(true);
        expect((await questOf(questId)).registeredAdventurers).toHaveLength(2);
        expect(cancelledPushes()).toEqual([]);
    });
});
