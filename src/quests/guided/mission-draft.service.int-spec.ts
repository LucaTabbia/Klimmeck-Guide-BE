import { type Model, Types } from 'mongoose';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushService } from 'src/push/push.service';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildQuest,
    persistLootItem,
    persistPet,
} from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GuidedMissionModule } from './guided-mission.module';
import { MissionDraft, MissionDraftStep } from './mission-draft.model';
import { MissionDraftService } from './mission-draft.service';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const NOT_FOUND = { code: 'NOT_FOUND' };
const QUEST_IN_PROGRESS = { code: 'QUEST_IN_PROGRESS' };
const MAGE_AND_PALADIN = [
    { title: 'mage', count: 1 },
    { title: 'paladin', count: 1 },
];

describe('MissionDraftService (replSet)', () => {
    let world: OutcomeHarness;
    let service: MissionDraftService;
    let drafts: Model<any>;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            imports: [GuidedMissionModule],
        });
        service = world.harness.app.get(MissionDraftService);
        drafts = world.harness.connection.model(MissionDraft.name);
        await drafts.init();
    });

    beforeEach(async () => {
        await world.reset();
        chance.load([]);
    });

    afterAll(async () => {
        await world.harness.close();
    });

    function quester(options: Partial<QuesterOptions> = {}): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-draft-${seq}`,
            ...options,
        });
    }

    const gmQuest = (
        type: 'story' | 'worldMission',
        prizes: Record<string, unknown> = {},
        requirements: Record<string, unknown> = {},
    ) => ({
        infos: { ...buildQuest().infos, type, title: 'La corte del re' },
        requirements: {
            ...buildQuest().requirements,
            minTitle: 'rookie',
            ...requirements,
        },
        prizes: { ...buildQuest().prizes, ...prizes },
    });

    const storyQuester = (options: Partial<QuesterOptions> = {}) =>
        quester({
            lane: QuestLane.story,
            questOverrides: gmQuest('story', {
                xpPrize: 400,
                prizeCoins: { gold: 0, silver: 2, copper: 0 },
            }),
            ...options,
        });

    async function worldMissionPair(questOverrides = gmQuest('worldMission')) {
        const first = await quester({
            lane: QuestLane.worldMission,
            questOverrides,
        });
        const second = await quester({
            lane: QuestLane.worldMission,
            quest: first.quest,
        });
        return { first, second };
    }

    const hexOf = (subject: Quester) => String(subject.pendingQuest._id);

    const markerOf = async (subject: Quester) =>
        (
            await world.models.pendingQuests.collection.findOne({
                _id: subject.pendingQuest._id,
            })
        )?.missionDraftStartedAt;

    const draftCount = () => drafts.countDocuments();

    it('starts a story draft and marks its pending quest (D-09, D-11)', async () => {
        const subject = await storyQuester({
            characterOverrides: {
                status: { title: 'adventurer', maxLifePoints: 240 },
            },
        });

        const draft = await service.start(hexOf(subject), null);

        expect(await draftCount()).toBe(1);
        expect(draft.questType).toBe('story');
        expect(draft.step).toBe(MissionDraftStep.teleport);
        expect(draft.fights).toEqual([]);
        expect(draft.place).toBeNull();
        expect(draft.startedBy).toBeNull();
        expect(draft.startedAt).toEqual(NOW);
        expect(draft.participants).toEqual([
            {
                character: subject.characterId,
                pendingQuest: subject.pendingQuest._id,
                name: subject.player.character!.infos.name,
                title: 'adventurer',
                maxLifePoints: 240,
            },
        ]);
        expect(await markerOf(subject)).toEqual(NOW);
    });

    it('prefills each participant with the block of their title (D-22)', async () => {
        const [potion, bone, herb] = await Promise.all(
            ['Pozione', 'Osso', 'Erba'].map(
                async (name) =>
                    (await persistLootItem(world.models.lootItems, { name }))
                        ._id as Types.ObjectId,
            ),
        );
        const pet = (await persistPet(world.models.pets, { name: 'Lupo' }))
            ._id as Types.ObjectId;
        const loot = (item: Types.ObjectId, quantity = 1) => ({
            itemType: 'LootItem',
            item,
            quantity,
        });
        const questOverrides = gmQuest(
            'worldMission',
            {
                rankPrizes: [
                    {
                        title: 'mage',
                        xpPrize: 300,
                        prizeCoins: { gold: 1, silver: 0, copper: 0 },
                        prizeItem: loot(potion),
                        randomLoot: [loot(bone, 2), loot(herb)],
                        pet,
                    },
                    {
                        title: 'paladin',
                        xpPrize: 120,
                        prizeCoins: { gold: 0, silver: 4, copper: 0 },
                        randomLoot: [loot(herb, 3)],
                    },
                ],
            },
            { minTitle: 'paladin', requiredAdventurers: MAGE_AND_PALADIN },
        );
        const mage = await quester({
            lane: QuestLane.worldMission,
            questOverrides,
            characterOverrides: { status: { title: 'mage' } },
        });
        const paladin = await quester({
            lane: QuestLane.worldMission,
            quest: mage.quest,
            characterOverrides: { status: { title: 'paladin' } },
        });

        const draft = await service.start(hexOf(paladin), null);

        const prizeOf = (subject: Quester) =>
            draft.prizes.find(
                ({ character }) =>
                    String(character) === String(subject.characterId),
            );
        expect(draft.prizes).toHaveLength(2);
        expect(prizeOf(mage)).toEqual({
            character: mage.characterId,
            coins: { gold: 1, silver: 0, copper: 0 },
            xp: 300,
            items: [
                { itemType: 'LootItem', item: potion, quantity: 1 },
                { itemType: 'LootItem', item: bone, quantity: 2 },
                { itemType: 'LootItem', item: herb, quantity: 1 },
            ],
            pet,
            spell: null,
            cure: null,
        });
        expect(prizeOf(paladin)).toEqual({
            character: paladin.characterId,
            coins: { gold: 0, silver: 4, copper: 0 },
            xp: 120,
            items: [{ itemType: 'LootItem', item: herb, quantity: 3 }],
            pet: null,
            spell: null,
            cure: null,
        });
    });

    it('starts one draft for the whole world mission from any entry (D-18)', async () => {
        const { first, second } = await worldMissionPair();

        const started = await service.start(hexOf(first), null);
        const again = await service.start(hexOf(second), null);

        expect(String(again._id)).toBe(String(started._id));
        expect(await draftCount()).toBe(1);
        expect(started.questType).toBe('worldMission');
        expect(started.participants).toHaveLength(2);
        expect(await markerOf(first)).toEqual(NOW);
        expect(await markerOf(second)).toEqual(NOW);
    });

    it('keeps one draft under two concurrent starts (D-18)', async () => {
        const { first, second } = await worldMissionPair();

        const [one, two] = await Promise.all([
            service.start(hexOf(first), null),
            service.start(hexOf(second), null),
        ]);

        expect(String(one._id)).toBe(String(two._id));
        expect(await draftCount()).toBe(1);
    });

    describe('push to the participants (utente 2026-11-14)', () => {
        const pushSpy = () =>
            jest
                .spyOn(world.harness.app.get(PushService), 'sendToUser')
                .mockResolvedValue({ sent: 0, failed: 0, pruned: 0 } as never);

        afterEach(() => jest.restoreAllMocks());

        it('tells every participant once that the mission starts', async () => {
            const { first, second } = await worldMissionPair();
            const push = pushSpy();

            await service.start(hexOf(first), null);
            await service.start(hexOf(second), null);

            const sent = push.mock.calls.map(([userId, message]) => ({
                userId: String(userId),
                message,
            }));
            expect(sent).toHaveLength(2);
            expect(sent).toEqual(
                expect.arrayContaining(
                    [first, second].map((subject) => ({
                        userId: String(subject.player.user._id),
                        message: {
                            type: PushEventType.missionStart,
                            id: String(subject.characterId),
                            title: 'La missione comincia',
                            body: "L'oste ha dato inizio a «La corte del re»",
                            ttlSeconds: 3600,
                        },
                    })),
                ),
            );
        });

        it('sends one push per participant under two concurrent starts', async () => {
            const { first, second } = await worldMissionPair();
            const push = pushSpy();

            await Promise.all([
                service.start(hexOf(first), null),
                service.start(hexOf(second), null),
            ]);

            expect(push).toHaveBeenCalledTimes(2);
        });

        it('sends nothing when the start is refused', async () => {
            const subject = await storyQuester();
            await world.models.characters.collection.updateOne(
                { _id: subject.characterId },
                { $set: { 'quests.pendingQuest': new Types.ObjectId() } },
            );
            const push = pushSpy();

            await expect(
                service.start(hexOf(subject), null),
            ).rejects.toMatchObject(QUEST_IN_PROGRESS);

            expect(push).not.toHaveBeenCalled();
        });
    });

    it('refuses to start while a participant has a busy standard lane (D-23)', async () => {
        const { first, second } = await worldMissionPair();
        await world.models.characters.collection.updateOne(
            { _id: second.characterId },
            { $set: { 'quests.pendingQuest': new Types.ObjectId() } },
        );

        await expect(service.start(hexOf(first), null)).rejects.toMatchObject(
            QUEST_IN_PROGRESS,
        );

        expect(await draftCount()).toBe(0);
        expect(await markerOf(first)).toBeNull();
        expect(await markerOf(second)).toBeNull();
    });

    it('answers not found for a standard or unknown pending quest (D-09)', async () => {
        const standard = await quester({ lane: QuestLane.standard });

        await expect(
            service.start(hexOf(standard), null),
        ).rejects.toMatchObject(NOT_FOUND);
        await expect(
            service.start(new Types.ObjectId().toHexString(), null),
        ).rejects.toMatchObject(NOT_FOUND);
        expect(await draftCount()).toBe(0);
    });

    it('reads the draft from any pending quest of the group and null without one (D-09)', async () => {
        const { first, second } = await worldMissionPair();

        expect(await service.read(hexOf(first))).toBeNull();
        const started = await service.start(hexOf(first), null);

        expect(String((await service.read(hexOf(second)))?._id)).toBe(
            String(started._id),
        );
        expect(String((await service.read(hexOf(first)))?._id)).toBe(
            String(started._id),
        );
    });

    it('drops an orphan draft whose pending quests are gone (D-09)', async () => {
        const subject = await storyQuester();
        await service.start(hexOf(subject), null);
        await world.models.pendingQuests.collection.deleteOne({
            _id: subject.pendingQuest._id,
        });

        expect(await service.read(hexOf(subject))).toBeNull();
        expect(await draftCount()).toBe(0);
    });

    it('discards the draft and frees the participants (D-11)', async () => {
        const { first, second } = await worldMissionPair();
        await service.start(hexOf(first), null);

        await service.discard(hexOf(second));

        expect(await draftCount()).toBe(0);
        for (const subject of [first, second]) {
            const raw = await world.models.pendingQuests.collection.findOne({
                _id: subject.pendingQuest._id,
            });
            expect(raw).toHaveProperty('missionDraftStartedAt', null);
        }
    });

    it('clears the markers even without a draft document (D-11)', async () => {
        const subject = await storyQuester();
        await world.models.pendingQuests.collection.updateOne(
            { _id: subject.pendingQuest._id },
            { $set: { missionDraftStartedAt: NOW } },
        );

        await service.discard(hexOf(subject));

        const raw = await world.models.pendingQuests.collection.findOne({
            _id: subject.pendingQuest._id,
        });
        expect(raw).toHaveProperty('missionDraftStartedAt', null);
    });

    it('writes the sections and the update time (D-18)', async () => {
        const subject = await storyQuester();
        const started = await service.start(hexOf(subject), null);
        const place = new Types.ObjectId();
        clock.advanceSeconds(90);

        const written = await service.write(started._id, {
            step: MissionDraftStep.fights,
            place,
        });

        expect(written.step).toBe(MissionDraftStep.fights);
        expect(written.place).toEqual(place);
        expect(written.updatedAt).toEqual(clock.now());
        expect(written.startedAt).toEqual(started.startedAt);
        const stored = await drafts.findById(started._id).lean<any>();
        expect(stored.step).toBe(MissionDraftStep.fights);
        expect(stored.place).toEqual(place);
    });
});
