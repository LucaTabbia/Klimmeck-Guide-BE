import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { PushEventType } from 'src/push/push-event-type.enum';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistEnemy,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    registerDevice,
} from '../../../test/quests/outcome-world';
import { ScriptedCombatResolver } from '../../../test/quests/scripted-combat-resolver';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { buildAidQuest } from './aid/aid-quest';
import { OutcomeWriter, StaleResolution } from './outcome-writer.service';
import { QuestResolutionService } from './quest-resolution.service';
import { RescueResolutionService } from './rescue-resolution.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const INJURED_SINCE = new Date('2026-10-23T12:00:00.000Z');
const ARCHIVED_AT = new Date('2026-10-24T08:00:00.000Z');
const ORIGINAL_TITLE = 'Il bandito del passo';
const BOSS_TITLE = 'Il drago del passo';
const INJURED_HP = 300;
const FRESH_STATUS = {
    xp: 0,
    level: 1,
    currentLifePoints: 1000,
    maxLifePoints: 1000,
    coins: { gold: 0, silver: 0, copper: 0 },
};

interface RescueWorld {
    original: any;
    aid: any;
    injured: TestPlayer;
    injuredId: Types.ObjectId;
    rescuer: Quester;
    marker: Types.ObjectId;
    cityMarker: Types.ObjectId;
}

describe('QuestResolutionService.resolveStandard for a rescue aid (replSet)', () => {
    let world: OutcomeHarness;
    let service: QuestResolutionService;
    let writer: OutcomeWriter;
    let archiver: CharacterArchiver;
    let warn: jest.SpyInstance;
    let log: jest.SpyInstance;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();
    const scripted = new ScriptedCombatResolver();

    beforeAll(async () => {
        world = await createOutcomeHarness({ clock, chance, combat: scripted });
        service = world.harness.app.get(QuestResolutionService);
        writer = world.harness.app.get(OutcomeWriter);
        archiver = world.harness.app.get(CharacterArchiver);
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
        scripted.reset();
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
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

    // ferito X in attesa di soccorso con la aid A clonata da O; soccorritore R registrato su A e scaduto
    async function rescueWorld(
        options: { inCity?: boolean } = {},
    ): Promise<RescueWorld> {
        seq += 1;
        const marker = new Types.ObjectId();
        const cityMarker = new Types.ObjectId();
        await persistCity(world.models.cities, {
            pointsOfInterest: options.inCity === false ? [] : [marker],
            markerLocation: cityMarker,
        });
        const foe = (await persistEnemy(world.models.enemies, {
            xp: 100,
        })) as { _id: Types.ObjectId };
        const original = await world.models.quests.create(
            buildQuest({
                infos: {
                    ...buildQuest().infos,
                    type: 'enemy',
                    title: ORIGINAL_TITLE,
                    markerLocation: marker,
                    enemy: foe._id,
                },
                prizes: { ...buildQuest().prizes, xpPrize: 50 },
            }),
        );
        const aidId = new Types.ObjectId();
        const injured = await createPlayer(world.harness, {
            twitchId: `tw-injured-${seq}`,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    ...FRESH_STATUS,
                    currentLifePoints: INJURED_HP,
                    awaitingAid: {
                        quest: original._id,
                        aidQuest: aidId,
                        since: INJURED_SINCE,
                    },
                },
            },
        });
        const injuredId = injured.character!._id as Types.ObjectId;
        await registerDevice(world.harness, injured);
        const aid = await world.models.quests.create(
            buildAidQuest(original.toObject() as never, [injuredId], aidId),
        );
        const rescuer = await persistQuester(world.harness, {
            twitchId: `tw-rescuer-${seq}`,
            quest: aid,
            characterOverrides: { status: FRESH_STATUS },
        });
        await registerDevice(world.harness, rescuer.player);
        return {
            original: original.toObject(),
            aid: aid.toObject(),
            injured,
            injuredId,
            rescuer,
            marker,
            cityMarker,
        };
    }

    const resolve = ({ rescuer }: RescueWorld) =>
        service.resolveStandard({
            pendingQuestId: rescuer.pendingQuest._id as Types.ObjectId,
            startDate: OUTCOME_START,
        });

    const characterOf = (id: unknown) =>
        world.models.characters.findById(id).lean<any>();

    const questOf = (id: unknown) =>
        world.models.quests.findById(id).lean<any>();

    const resultsOf = (id: unknown) =>
        world.models.questResults.find({ character: id }).lean<any[]>();

    const seatsOf = (quest: any) =>
        (quest.registeredAdventurers ?? []).map((seat: any) =>
            String(seat.character),
        );

    const questEndTokens = () =>
        world.push.sent
            .filter(({ message }) => message.type === PushEventType.questEnd)
            .flatMap(({ tokens }) => tokens)
            .sort();
    const tokenOf = (player: TestPlayer) => `tok-${String(player.user._id)}`;

    const messagesOf = (spy: jest.SpyInstance) =>
        spy.mock.calls.map(([message]) => String(message));

    // archivio reale nella transazione dell'harness, come deleteCharacter
    const archive = (userId: unknown, characterId: Types.ObjectId) =>
        world.harness.connection.transaction((session) =>
            archiver.archiveWithin(session, {
                userId: userId as Types.ObjectId,
                characterId,
                reason: DeletionReason.user_request,
                now: NOW,
            }),
        );

    it('frees the injured in the marker city when the rescue succeeds', async () => {
        const rescue = await rescueWorld();
        const { rescuer, injuredId } = rescue;
        scripted.willEnd('success');

        await expect(resolve(rescue)).resolves.toBe('resolved');

        const [rescuerResult] = await resultsOf(rescuer.characterId);
        expect(rescuerResult).toMatchObject({
            outcome: 'success',
            xpGained: 150,
        });
        expect(rescuerResult.rescuedCharacters.map(String)).toEqual([
            String(injuredId),
        ]);
        const healed = await characterOf(rescuer.characterId);
        expect(healed.status.xp).toBe(150);
        const injured = await characterOf(injuredId);
        expect(injured.status.awaitingAid).toBeNull();
        expect(String(injured.status.location)).toBe(String(rescue.cityMarker));
        expect(injured.status.currentLifePoints).toBe(INJURED_HP);
        expect(injured.deletedAt ?? null).toBeNull();
        const injuredResults = await resultsOf(injuredId);
        expect(injuredResults).toHaveLength(1);
        expect(injuredResults[0].outcome).toBe('rescued');
        expect(String(injuredResults[0].user)).toBe(
            String(rescue.injured.user._id),
        );
        const written = await world.models.questResults.find().lean<any[]>();
        expect(written).toHaveLength(2);
        expect(written.map((result) => result.acknowledgedAt)).toEqual(
            written.map(() => null),
        );
        const aid = await questOf(rescue.aid._id);
        expect(aid.concludedAt).toEqual(NOW);
        expect(questEndTokens()).toEqual(
            [tokenOf(rescuer.player), tokenOf(rescue.injured)].sort(),
        );
        expect(world.questQueue.added).toHaveLength(0);
    });

    it('frees the injured where they stand when the marker is in no city', async () => {
        const rescue = await rescueWorld({ inCity: false });
        const before = await characterOf(rescue.injuredId);

        await expect(resolve(rescue)).resolves.toBe('resolved');

        const injured = await characterOf(rescue.injuredId);
        expect(injured.status.awaitingAid).toBeNull();
        expect(String(injured.status.location)).toBe(
            String(before.status.location),
        );
        expect(
            messagesOf(warn).some((message) =>
                message.includes(String(rescue.marker)),
            ),
        ).toBe(true);
    });

    it('kills the injured and chains a new aid when the rescue fails', async () => {
        const rescue = await rescueWorld();
        const { rescuer, injuredId } = rescue;
        const elsewhere = await world.models.quests.create(
            buildQuest({
                infos: { ...buildQuest().infos, type: 'enemy' },
                registeredAdventurers: [
                    { character: injuredId, title: 'rookie' },
                ],
            }),
        );
        scripted
            .willEnd('failure')
            .willResolve(rescuer.characterId, { hpAfter: 200 });

        await expect(resolve(rescue)).resolves.toBe('resolved');

        const injured = await characterOf(injuredId);
        expect(injured.deletedAt).toEqual(NOW);
        expect(injured.deletionReason).toBe('death');
        const injuredUser = await world.models.users
            .findById(rescue.injured.user._id)
            .lean<any>();
        expect(String(injuredUser.currentCharacter)).toBe(String(injuredId));
        expect(seatsOf(await questOf(elsewhere._id))).toEqual([]);
        const [death] = await resultsOf(injuredId);
        expect(death.outcome).toBe('death');
        expect(String(death.user)).toBe(String(rescue.injured.user._id));
        const written = await world.models.questResults.find().lean<any[]>();
        expect(written).toHaveLength(2);
        expect(written.map((result) => result.acknowledgedAt)).toEqual(
            written.map(() => null),
        );
        const fallen = await characterOf(rescuer.characterId);
        expect(fallen.status.currentLifePoints).toBe(200);
        const { awaitingAid } = fallen.status;
        expect(String(awaitingAid.quest)).toBe(String(rescue.original._id));
        const chained = await questOf(awaitingAid.aidQuest);
        expect(chained.infos.title).toBe(`Soccorso: ${ORIGINAL_TITLE}`);
        expect(String(chained.rescue.failedQuest)).toBe(
            String(rescue.original._id),
        );
        expect(chained.rescue.characters.map(String)).toEqual([
            String(rescuer.characterId),
        ]);
        expect(chained.concludedAt).toBeNull();
        const aid = await questOf(rescue.aid._id);
        expect(aid.concludedAt).toEqual(NOW);
        expect(seatsOf(aid)).toEqual([]);
        expect(questEndTokens()).toEqual(
            [tokenOf(rescuer.player), tokenOf(rescue.injured)].sort(),
        );
        expect(world.questQueue.added).toEqual([
            expect.objectContaining({
                name: 'aid-timeout',
                options: expect.objectContaining({
                    jobId: `aid-${String(chained._id)}`,
                }),
            }),
        ]);
    });

    it('resolves the rescuer alone when the injured was already deleted (C1)', async () => {
        const rescue = await rescueWorld();
        const { rescuer, injuredId } = rescue;
        await world.models.characters.updateOne(
            { _id: injuredId },
            { $set: { deletedAt: ARCHIVED_AT, deletionReason: 'voluntary' } },
        );
        await world.models.users.updateOne(
            { _id: rescue.injured.user._id },
            { $set: { currentCharacter: null } },
        );
        // come la lascia l'archivio: nessun ferito da soccorrere, aid conclusa
        await world.models.quests.updateOne(
            { _id: rescue.aid._id },
            { $set: { 'rescue.characters': [], concludedAt: ARCHIVED_AT } },
        );
        const branch = jest.spyOn(
            world.harness.app.get(RescueResolutionService),
            'resolveRescue',
        );
        scripted.willEnd('failure');

        await expect(resolve(rescue)).resolves.toBe('resolved');

        expect(branch).not.toHaveBeenCalled();
        expect(await resultsOf(injuredId)).toHaveLength(0);
        const [rescuerResult] = await resultsOf(rescuer.characterId);
        expect(rescuerResult.outcome).toBe('failure');
        expect(rescuerResult.rescuedCharacters).toEqual([]);
        const fallen = await characterOf(rescuer.characterId);
        const chained = await questOf(fallen.status.awaitingAid.aidQuest);
        expect(chained.rescue.characters.map(String)).toEqual([
            String(rescuer.characterId),
        ]);
        expect(String(chained.rescue.failedQuest)).toBe(
            String(rescue.original._id),
        );
        expect(chained.requirements.requiredAdventurers).toEqual(
            rescue.aid.requirements.requiredAdventurers.map(
                ({ title, count }: { title: unknown; count: number }) => ({
                    title,
                    count,
                }),
            ),
        );
        expect(chained.infos.title).toBe(`Soccorso: ${ORIGINAL_TITLE}`);
        const injured = await characterOf(injuredId);
        expect(injured.deletionReason).toBe('voluntary');
        expect(injured.deletedAt).toEqual(ARCHIVED_AT);
        expect(
            [...messagesOf(log), ...messagesOf(warn)].some((message) =>
                message.includes(String(injuredId)),
            ),
        ).toBe(false);
        expect(questEndTokens()).toEqual([tokenOf(rescuer.player)]);
    });

    it('clones the chained aid from the aid itself when the original is gone', async () => {
        const rescue = await rescueWorld();
        const { rescuer } = rescue;
        await world.models.quests.deleteOne({ _id: rescue.original._id });
        scripted.willEnd('failure');

        await expect(resolve(rescue)).resolves.toBe('resolved');

        const fallen = await characterOf(rescuer.characterId);
        const chained = await questOf(fallen.status.awaitingAid.aidQuest);
        expect(chained.infos.title).toBe(`Soccorso: ${ORIGINAL_TITLE}`);
        expect(String(chained.rescue.failedQuest)).toBe(
            String(rescue.original._id),
        );
        expect(String(fallen.status.awaitingAid.quest)).toBe(
            String(rescue.original._id),
        );
    });

    it('routes rescue aids through the rescue branch', async () => {
        const rescue = await rescueWorld();
        const branch = jest.spyOn(
            world.harness.app.get(RescueResolutionService),
            'resolveRescue',
        );

        await expect(resolve(rescue)).resolves.toBe('resolved');

        expect(branch).toHaveBeenCalledTimes(1);
        const injured = await characterOf(rescue.injuredId);
        expect(injured.status.awaitingAid).toBeNull();
    });

    it.each([
        ['success', 'rescued'],
        ['failure', 'death'],
    ] as const)(
        'delivers once, after the %s of the rescue is committed',
        async (outcome, injuredOutcome) => {
            const rescue = await rescueWorld();
            scripted.willEnd(outcome);
            const original = writer.deliver.bind(writer);
            const seen: unknown[] = [];
            const deliver = jest
                .spyOn(writer, 'deliver')
                .mockImplementation(async (committed) => {
                    seen.push(
                        await world.models.questResults.exists({
                            character: rescue.injuredId,
                            outcome: injuredOutcome,
                        }),
                    );
                    await original(committed);
                });

            await expect(resolve(rescue)).resolves.toBe('resolved');

            expect(deliver).toHaveBeenCalledTimes(1);
            expect(seen).toHaveLength(1);
            expect(seen[0]).toBeTruthy();
        },
    );

    it('leaves no side effect when the death aborts the transaction', async () => {
        const rescue = await rescueWorld();
        const { rescuer, injuredId } = rescue;
        scripted.willEnd('failure');
        jest.spyOn(archiver, 'archiveWithin').mockRejectedValueOnce(
            new StaleResolution(),
        );
        const deliver = jest.spyOn(writer, 'deliver');

        await expect(resolve(rescue)).resolves.toBe('stale');

        const injured = await characterOf(injuredId);
        expect(injured.deletedAt ?? null).toBeNull();
        expect(String(injured.status.awaitingAid.aidQuest)).toBe(
            String(rescue.aid._id),
        );
        expect(await world.models.questResults.countDocuments()).toBe(0);
        expect(
            await world.models.quests.countDocuments({ 'infos.type': 'aid' }),
        ).toBe(1);
        const fallen = await characterOf(rescuer.characterId);
        expect(fallen.status.awaitingAid ?? null).toBeNull();
        expect(String(fallen.quests.pendingQuest)).toBe(
            String(rescuer.pendingQuest._id),
        );
        expect((await questOf(rescue.aid._id)).concludedAt).toBeNull();
        expect(deliver).not.toHaveBeenCalled();
        expect(world.push.sent).toHaveLength(0);
        expect(world.questQueue.added).toHaveLength(0);
    });

    describe('a group aid', () => {
        interface GroupRescueWorld {
            boss: any;
            aid: any;
            wounded: TestPlayer[];
            woundedIds: Types.ObjectId[];
            rescuers: Quester[];
            cityMarker: Types.ObjectId;
        }

        const LATER_START = new Date(OUTCOME_START.getTime() + 60 * 60 * 1000);

        // feriti A e B del boss da 3 posti con la sola aid G; soccorritori R1 e R2 registrati su G
        async function groupRescueWorld(
            options: { secondStart?: Date | null } = {},
        ): Promise<GroupRescueWorld> {
            seq += 1;
            const marker = new Types.ObjectId();
            const cityMarker = new Types.ObjectId();
            await persistCity(world.models.cities, {
                pointsOfInterest: [marker],
                markerLocation: cityMarker,
            });
            const foe = (await persistEnemy(world.models.enemies, {
                xp: 100,
            })) as { _id: Types.ObjectId };
            const boss = await world.models.quests.create(
                buildQuest({
                    infos: {
                        ...buildQuest().infos,
                        type: 'boss',
                        title: BOSS_TITLE,
                        markerLocation: marker,
                        enemy: foe._id,
                    },
                    requirements: {
                        ...buildQuest().requirements,
                        requiredAdventurers: [{ title: null, count: 3 }],
                    },
                    prizes: { ...buildQuest().prizes, xpPrize: 50 },
                }),
            );
            const aidId = new Types.ObjectId();
            const wounded: TestPlayer[] = [];
            for (const tag of ['a', 'b']) {
                const player = await createPlayer(world.harness, {
                    twitchId: `tw-wounded-${tag}-${seq}`,
                    characterOverrides: {
                        status: {
                            ...buildCharacter().status,
                            ...FRESH_STATUS,
                            currentLifePoints: INJURED_HP,
                            awaitingAid: {
                                quest: boss._id,
                                aidQuest: aidId,
                                since: INJURED_SINCE,
                            },
                        },
                    },
                });
                await registerDevice(world.harness, player);
                wounded.push(player);
            }
            const woundedIds = wounded.map(
                (player) => player.character!._id as Types.ObjectId,
            );
            const aid = await world.models.quests.create(
                buildAidQuest(boss.toObject() as never, woundedIds, aidId),
            );
            const rescuers: Quester[] = [];
            for (const [index, startDate] of [
                OUTCOME_START,
                options.secondStart === undefined
                    ? OUTCOME_START
                    : options.secondStart,
            ].entries()) {
                const rescuer = await persistQuester(world.harness, {
                    twitchId: `tw-group-rescuer-${index}-${seq}`,
                    quest: aid,
                    startDate,
                    characterOverrides: { status: FRESH_STATUS },
                });
                await registerDevice(world.harness, rescuer.player);
                rescuers.push(rescuer);
            }
            return {
                boss: boss.toObject(),
                aid: aid.toObject(),
                wounded,
                woundedIds,
                rescuers,
                cityMarker,
            };
        }

        const triggerOf = (rescuer: Quester) =>
            service.resolveStandard({
                pendingQuestId: rescuer.pendingQuest._id as Types.ObjectId,
                startDate: rescuer.pendingQuest.startDate ?? OUTCOME_START,
            });

        const sortedIds = (ids: readonly unknown[]) => ids.map(String).sort();

        it('waits while a registered rescuer is still on the way', async () => {
            const group = await groupRescueWorld({ secondStart: LATER_START });
            const [first] = group.rescuers;

            await expect(triggerOf(first)).resolves.toBe('waiting');

            expect(await world.models.questResults.countDocuments()).toBe(0);
            expect(scripted.contexts).toHaveLength(0);
            for (const id of group.woundedIds) {
                const injured = await characterOf(id);
                expect(String(injured.status.awaitingAid.aidQuest)).toBe(
                    String(group.aid._id),
                );
            }
            expect((await questOf(group.aid._id)).concludedAt).toBeNull();
            expect(
                await world.models.pendingQuests.countDocuments({
                    _id: {
                        $in: group.rescuers.map(
                            ({ pendingQuest }) => pendingQuest._id,
                        ),
                    },
                }),
            ).toBe(2);
            expect(world.push.sent).toHaveLength(0);
        });

        it('waits while a registered rescuer has not started', async () => {
            const group = await groupRescueWorld({ secondStart: null });

            await expect(triggerOf(group.rescuers[0])).resolves.toBe('waiting');

            expect(await world.models.questResults.countDocuments()).toBe(0);
        });

        it('frees every wounded with one fight when the party wins', async () => {
            const group = await groupRescueWorld();
            const [first, second] = group.rescuers;
            scripted.willEnd('success');

            await expect(triggerOf(first)).resolves.toBe('resolved');

            expect(scripted.contexts).toHaveLength(1);
            expect(scripted.contexts[0].participants).toHaveLength(2);
            for (const id of group.woundedIds) {
                const injured = await characterOf(id);
                expect(injured.status.awaitingAid).toBeNull();
                expect(String(injured.status.location)).toBe(
                    String(group.cityMarker),
                );
                const [result] = await resultsOf(id);
                expect(result.outcome).toBe('rescued');
            }
            for (const rescuer of group.rescuers) {
                const [result] = await resultsOf(rescuer.characterId);
                expect(result).toMatchObject({
                    outcome: 'success',
                    xpGained: 150,
                });
                expect(sortedIds(result.rescuedCharacters)).toEqual(
                    sortedIds(group.woundedIds),
                );
            }
            expect((await questOf(group.aid._id)).concludedAt).toEqual(NOW);
            expect(
                await world.models.pendingQuests.countDocuments({
                    _id: {
                        $in: group.rescuers.map(
                            ({ pendingQuest }) => pendingQuest._id,
                        ),
                    },
                }),
            ).toBe(0);
            expect(questEndTokens()).toEqual(
                [
                    ...group.rescuers.map(({ player }) => tokenOf(player)),
                    ...group.wounded.map(tokenOf),
                ].sort(),
            );
            expect(world.questQueue.added).toHaveLength(0);

            await expect(triggerOf(second)).resolves.toBe('stale');
            expect(await world.models.questResults.countDocuments()).toBe(4);
        });

        it('kills every wounded and chains one aid for the party when it loses', async () => {
            const group = await groupRescueWorld();
            scripted.willEnd('failure');

            await expect(triggerOf(group.rescuers[0])).resolves.toBe(
                'resolved',
            );

            for (const [index, id] of group.woundedIds.entries()) {
                const dead = await characterOf(id);
                expect(dead.deletedAt).toEqual(NOW);
                expect(dead.deletionReason).toBe('death');
                const user = await world.models.users
                    .findById(group.wounded[index].user._id)
                    .lean<any>();
                expect(String(user.currentCharacter)).toBe(String(id));
                const [result] = await resultsOf(id);
                expect(result.outcome).toBe('death');
            }
            const created = await world.models.quests
                .find({
                    'infos.type': 'aid',
                    _id: { $ne: group.aid._id },
                })
                .lean<any[]>();
            expect(created).toHaveLength(1);
            const [chained] = created;
            expect(sortedIds(chained.rescue.characters)).toEqual(
                sortedIds(group.rescuers.map(({ characterId }) => characterId)),
            );
            expect(String(chained.rescue.failedQuest)).toBe(
                String(group.boss._id),
            );
            expect(chained.requirements.requiredAdventurers).toEqual([
                { title: null, count: 3 },
            ]);
            expect(chained.infos.title).toBe(`Soccorso: ${BOSS_TITLE}`);
            for (const rescuer of group.rescuers) {
                const [result] = await resultsOf(rescuer.characterId);
                expect(result.outcome).toBe('failure');
                expect(result.rescuedCharacters).toEqual([]);
                const fallen = await characterOf(rescuer.characterId);
                expect(String(fallen.status.awaitingAid.aidQuest)).toBe(
                    String(chained._id),
                );
                expect(String(fallen.status.awaitingAid.quest)).toBe(
                    String(group.boss._id),
                );
            }
            // claim prima della morte: la aid è già conclusa quando l'archivio passa, la lista dei feriti resta come storico
            const old = await questOf(group.aid._id);
            expect(old.concludedAt).toEqual(NOW);
            expect(sortedIds(old.rescue.characters)).toEqual(
                sortedIds(group.woundedIds),
            );
            expect(world.questQueue.added).toEqual([
                expect.objectContaining({
                    name: 'aid-timeout',
                    options: expect.objectContaining({
                        jobId: `aid-${String(chained._id)}`,
                    }),
                }),
            ]);
            expect(await world.models.questResults.countDocuments()).toBe(4);
            expect(questEndTokens()).toHaveLength(4);
        });

        it('frees only the wounded still linked to a user, logging the other by id', async () => {
            const group = await groupRescueWorld();
            const [linkedId, unlinkedId] = group.woundedIds;
            await world.models.users.updateOne(
                { _id: group.wounded[1].user._id },
                { $set: { currentCharacter: new Types.ObjectId() } },
            );
            scripted.willEnd('success');

            await expect(triggerOf(group.rescuers[0])).resolves.toBe(
                'resolved',
            );

            const freed = await characterOf(linkedId);
            expect(freed.status.awaitingAid).toBeNull();
            expect(await resultsOf(unlinkedId)).toHaveLength(0);
            expect(
                [...messagesOf(log), ...messagesOf(warn)].some((message) =>
                    message.includes(String(unlinkedId)),
                ),
            ).toBe(true);
            for (const rescuer of group.rescuers) {
                const [result] = await resultsOf(rescuer.characterId);
                expect(result.rescuedCharacters.map(String)).toEqual([
                    String(linkedId),
                ]);
            }
        });

        it('rescues with the rescuer left when the other was archived («Il BE non libera i posti delle quest avviate»)', async () => {
            const group = await groupRescueWorld();
            const [first, second] = group.rescuers;
            await world.models.quests.updateOne(
                { _id: group.aid._id },
                { $set: { startedAt: OUTCOME_START } },
            );
            await archive(second.player.user._id, second.characterId);
            const held = await questOf(group.aid._id);
            expect(seatsOf(held)).toEqual([
                String(first.characterId),
                String(second.characterId),
            ]);
            expect(held.registeredAdventurers[1].archivedAt).toEqual(NOW);
            scripted.willEnd('success');

            await expect(triggerOf(first)).resolves.toBe('resolved');

            expect(scripted.contexts).toHaveLength(1);
            expect(scripted.contexts[0].participants).toHaveLength(1);
            for (const id of group.woundedIds) {
                const results = await resultsOf(id);
                expect(results.map(({ outcome }) => outcome)).toEqual([
                    'rescued',
                ]);
            }
            const [result] = await resultsOf(first.characterId);
            expect(result.outcome).toBe('success');
            expect(await resultsOf(second.characterId)).toEqual([]);
            expect((await questOf(group.aid._id)).concludedAt).toEqual(NOW);
        });

        it('resolves once under concurrent triggers of the rescuers', async () => {
            const group = await groupRescueWorld();

            const outcomes = await Promise.all(
                group.rescuers.map((rescuer) => triggerOf(rescuer)),
            );

            expect([...outcomes].sort()).toEqual(['resolved', 'stale']);
            expect(await world.models.questResults.countDocuments()).toBe(4);
        });
    });
});
