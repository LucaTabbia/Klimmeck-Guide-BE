import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
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
        expect(String(rescuerResult.rescuedCharacter)).toBe(String(injuredId));
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
        expect(injuredUser.currentCharacter).toBeNull();
        expect(seatsOf(await questOf(elsewhere._id))).toEqual([]);
        const [death] = await resultsOf(injuredId);
        expect(death.outcome).toBe('death');
        expect(String(death.user)).toBe(String(rescue.injured.user._id));
        const fallen = await characterOf(rescuer.characterId);
        expect(fallen.status.currentLifePoints).toBe(200);
        const { awaitingAid } = fallen.status;
        expect(String(awaitingAid.quest)).toBe(String(rescue.original._id));
        const chained = await questOf(awaitingAid.aidQuest);
        expect(chained.infos.title).toBe(`Soccorso: ${ORIGINAL_TITLE}`);
        expect(String(chained.rescue.failedQuest)).toBe(
            String(rescue.original._id),
        );
        expect(String(chained.rescue.character)).toBe(
            String(rescuer.characterId),
        );
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
        await world.models.quests.updateOne(
            { _id: rescue.aid._id },
            { $set: { concludedAt: ARCHIVED_AT } },
        );
        scripted.willEnd('failure');

        await expect(resolve(rescue)).resolves.toBe('resolved');

        expect(await resultsOf(injuredId)).toHaveLength(0);
        const [rescuerResult] = await resultsOf(rescuer.characterId);
        expect(rescuerResult.outcome).toBe('failure');
        const injured = await characterOf(injuredId);
        expect(injured.deletionReason).toBe('voluntary');
        expect(injured.deletedAt).toEqual(ARCHIVED_AT);
        expect(
            messagesOf(log).some((message) =>
                message.includes(String(injuredId)),
            ),
        ).toBe(true);
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
});
