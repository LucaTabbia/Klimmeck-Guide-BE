import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { QuestsModule } from 'src/quests/quests.module';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import {
    connectAndAwaitClose,
    expectSilence,
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
    withTimeout,
} from '../../test/auth/ws-test-client';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { buildQuest } from '../../test/fixtures';

const QUEST_UPDATED =
    'subscription OnQuestUpdated($questId: String!) { questUpdated(questId: $questId) { id registeredAdventurers { character title } requirements { requiredAdventurers { title count } } infos { title } } }';
const PARTY_SEATS = [{ title: null, count: 3 }];
const MALFORMED_QUEST_ID = 'not-a-quest-id';
const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;
const FORBIDDEN_CLOSE_CODE = 4403;
const FORBIDDEN_REASON = 'Forbidden';
const STARTED_AT = new Date('2026-10-26T10:00:00.000Z');
const CONCLUDED_AT = new Date('2026-10-26T11:00:00.000Z');

interface WireQuest {
    id: string;
    registeredAdventurers: { character: string; title: string }[];
    requirements: {
        requiredAdventurers: { title: string | null; count: number }[];
    };
    infos: { title: string };
}

type QuestUpdated = { questUpdated: WireQuest };
type QuestUpdatedSubscription = OpenSubscription<QuestUpdated>;

describe('questUpdated subscription (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let quests: Model<QuestDocument>;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let seq = 0;
    const opened: QuestUpdatedSubscription[] = [];

    const registrationOf = (character: Types.ObjectId) => ({
        character,
        title: 'rookie',
        registeredAt: STARTED_AT,
    });

    function persistPartyQuest(registered: Types.ObjectId[] = []) {
        seq += 1;
        return quests.create(
            buildQuest({
                infos: {
                    ...buildQuest().infos,
                    type: 'boss',
                    title: `Il drago ${seq}`,
                },
                requirements: {
                    ...buildQuest().requirements,
                    requiredAdventurers: PARTY_SEATS,
                },
                registeredAdventurers: registered.map(registrationOf),
            }),
        );
    }

    // Pitfall 9: il cursore del change stream si apre in modo asincrono; si aggiorna una quest sentinella finché un evento arriva
    async function primeQuestsChangeStream(): Promise<void> {
        const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        const sentinel = await persistPartyQuest();
        const live = pubSub.subscribe('questUpdated');
        const received = live.next();
        try {
            for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
                await quests.updateOne(
                    { _id: sentinel._id },
                    { $set: { 'infos.title': `Sentinella ${attempt}` } },
                );
                const delivered = await withTimeout(
                    received,
                    PRIMING_WAIT_MS,
                ).catch(() => undefined);
                if (delivered) return;
            }
            throw new Error('change stream on quests never delivered an event');
        } finally {
            await live.return?.();
            await quests.deleteOne({ _id: sentinel._id });
        }
    }

    function subscribeTo(
        questId: string,
        bearer = alice.bearer,
    ): QuestUpdatedSubscription {
        const subscription = openSubscription<QuestUpdated>(
            url,
            { Authorization: bearer },
            { query: QUEST_UPDATED, variables: { questId } },
        );
        opened.push(subscription);
        return subscription;
    }

    async function nextQuest(
        subscription: QuestUpdatedSubscription,
    ): Promise<WireQuest> {
        const result = await subscription.next();
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.questUpdated as WireQuest;
    }

    const charactersOf = (quest: WireQuest) =>
        quest.registeredAdventurers.map(({ character }) => character);

    async function expectNotFound(
        subscription: QuestUpdatedSubscription,
    ): Promise<void> {
        const first = await subscription.next();
        expect(first.done).toBe(false);
        expect(first.value.data ?? null).toBeNull();
        expect(first.value.errors).toHaveLength(1);
        expect(first.value.errors?.[0]?.extensions).toEqual({
            code: 'NOT_FOUND',
        });
        const second = await subscription.next();
        expect(second.done).toBe(true);
    }

    const characterIdOf = (player: TestPlayer) =>
        player.character?._id as Types.ObjectId;

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [QuestsModule] });
        url = graphqlWsUrl(harness.port);
        quests = harness.connection.model<QuestDocument>(Quest.name);
        await quests.createCollection();
        await harness.clearDatabase();
        await primeQuestsChangeStream();
    });

    beforeEach(async () => {
        alice = await createPlayer(harness, { twitchId: `twitch-qu-a-${seq}` });
        bruno = await createPlayer(harness, { twitchId: `twitch-qu-b-${seq}` });
        seq += 1;
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('sends the open quest as a snapshot at subscribe time', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);

        expect(await nextQuest(subscribeTo(String(quest._id)))).toEqual({
            id: String(quest._id),
            registeredAdventurers: [
                { character: String(characterIdOf(alice)), title: 'rookie' },
            ],
            requirements: { requiredAdventurers: PARTY_SEATS },
            infos: { title: quest.infos.title },
        });
    });

    it('emits the populated quest at every registration and abandon', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);

        await quests.updateOne(
            { _id: quest._id },
            {
                $push: {
                    registeredAdventurers: registrationOf(characterIdOf(bruno)),
                },
            },
        );
        expect(charactersOf(await nextQuest(subscription))).toEqual([
            String(characterIdOf(alice)),
            String(characterIdOf(bruno)),
        ]);

        await quests.updateOne(
            { _id: quest._id },
            {
                $pull: {
                    registeredAdventurers: { character: characterIdOf(bruno) },
                },
            },
        );
        expect(charactersOf(await nextQuest(subscription))).toEqual([
            String(characterIdOf(alice)),
        ]);
    });

    it('emits once for the start and once for the released seats', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);

        await quests.updateOne(
            { _id: quest._id },
            { $set: { startedAt: STARTED_AT } },
        );
        expect(charactersOf(await nextQuest(subscription))).toEqual([
            String(characterIdOf(alice)),
        ]);

        await quests.updateOne(
            { _id: quest._id },
            { $set: { registeredAdventurers: [] } },
        );
        expect(charactersOf(await nextQuest(subscription))).toEqual([]);
    });

    it('stays silent on updates of another quest', async () => {
        const quest = await persistPartyQuest();
        const other = await persistPartyQuest();
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);
        await quests.updateOne(
            { _id: quest._id },
            {
                $push: {
                    registeredAdventurers: registrationOf(characterIdOf(alice)),
                },
            },
        );
        await nextQuest(subscription);

        await quests.updateOne(
            { _id: other._id },
            {
                $push: {
                    registeredAdventurers: registrationOf(characterIdOf(bruno)),
                },
            },
        );
        await expectSilence(subscription);

        await quests.updateOne(
            { _id: quest._id },
            {
                $push: {
                    registeredAdventurers: registrationOf(characterIdOf(bruno)),
                },
            },
        );
        const own = await nextQuest(subscription);
        expect(own.id).toBe(String(quest._id));
        expect(charactersOf(own)).toEqual([
            String(characterIdOf(alice)),
            String(characterIdOf(bruno)),
        ]);
    });

    it('stops emitting once the quest is concluded and answers NOT_FOUND afterwards', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);
        const debug = jest
            .spyOn(Logger.prototype, 'debug')
            .mockImplementation(() => undefined);
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);

        await quests.updateOne(
            { _id: quest._id },
            { $set: { concludedAt: CONCLUDED_AT } },
        );
        await expectSilence(subscription);

        expect(debug).toHaveBeenCalledWith(
            expect.stringContaining(String(quest._id)),
        );
        expect(error).not.toHaveBeenCalled();
        await expectNotFound(subscribeTo(String(quest._id)));
    });

    it('answers NOT_FOUND for a malformed quest id', async () => {
        await expectNotFound(subscribeTo(MALFORMED_QUEST_ID));
    });

    it('closes the connection_init without a bearer with 4403', async () => {
        expect(await connectAndAwaitClose(url, {})).toEqual({
            code: FORBIDDEN_CLOSE_CODE,
            reason: FORBIDDEN_REASON,
            acknowledged: false,
        });
    });

    it('delivers the same event to every subscriber of the quest', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);
        const first = subscribeTo(String(quest._id));
        const second = subscribeTo(String(quest._id), bruno.bearer);
        await nextQuest(first);
        await nextQuest(second);

        await quests.updateOne(
            { _id: quest._id },
            {
                $push: {
                    registeredAdventurers: registrationOf(characterIdOf(bruno)),
                },
            },
        );

        const [seenByFirst, seenBySecond] = await Promise.all([
            nextQuest(first),
            nextQuest(second),
        ]);
        expect(seenByFirst).toEqual(seenBySecond);
        expect(charactersOf(seenByFirst)).toEqual([
            String(characterIdOf(alice)),
            String(characterIdOf(bruno)),
        ]);
    });
});
