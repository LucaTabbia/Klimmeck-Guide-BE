import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
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
import { primeQuestsChangeStream } from '../../test/quests/quests-change-stream';

const QUEST_UPDATED =
    'subscription OnQuestUpdated($questId: String!) { questUpdated(questId: $questId) { id registeredAdventurers { character title } requirements { requiredAdventurers { title count } } infos { title } } }';
const PARTY_SEATS = [{ title: null, count: 3 }];
const MALFORMED_QUEST_ID = 'not-a-quest-id';
const PUBLISHED_WAIT_MS = 2000;
const TRAILING_WINDOW_MS = 500;
const FORBIDDEN_CLOSE_CODE = 4403;
const FORBIDDEN_REASON = 'Forbidden';
const STARTED_AT = new Date('2026-10-26T10:00:00.000Z');
const CONCLUDED_AT = new Date('2026-10-26T11:00:00.000Z');
const ARCHIVED_AT = new Date(STARTED_AT.getTime() + 60 * 60 * 1000);

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
    let lastId = 0;
    const opened: QuestUpdatedSubscription[] = [];

    // un solo contatore per titoli e twitchId: ogni chiamata dà un valore nuovo, chiunque la faccia
    const nextId = () => (lastId += 1);

    const registrationOf = (character: Types.ObjectId) => ({
        character,
        title: 'rookie',
        registeredAt: STARTED_AT,
    });

    function persistPartyQuest(
        registered: Types.ObjectId[] = [],
        startedAt: Date | null = null,
    ) {
        return quests.create(
            buildQuest({
                startedAt,
                infos: {
                    ...buildQuest().infos,
                    type: 'boss',
                    title: `Il drago ${nextId()}`,
                },
                requirements: {
                    ...buildQuest().requirements,
                    requiredAdventurers: PARTY_SEATS,
                },
                registeredAdventurers: registered.map(registrationOf),
            }),
        );
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

    // dopo l'evento sentinella (Pitfall 12): raccoglie quello che arriva ancora entro la finestra
    async function trailingQuests(
        subscription: QuestUpdatedSubscription,
    ): Promise<WireQuest[]> {
        const trailing: WireQuest[] = [];
        for (;;) {
            const result = await subscription
                .next(TRAILING_WINDOW_MS)
                .catch(() => undefined);
            if (!result || result.done) return trailing;
            trailing.push(result.value.data?.questUpdated as WireQuest);
        }
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

    function archive(player: TestPlayer) {
        return harness.connection.transaction((session) =>
            harness.app.get(CharacterArchiver).archiveWithin(session, {
                userId: player.user._id as Types.ObjectId,
                characterId: characterIdOf(player),
                reason: DeletionReason.user_request,
                now: ARCHIVED_AT,
            }),
        );
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestsModule, CharacterArchiveModule],
        });
        url = graphqlWsUrl(harness.port);
        quests = harness.connection.model<QuestDocument>(Quest.name);
        await quests.createCollection();
        await harness.clearDatabase();
        await primeQuestsChangeStream(harness);
    });

    beforeEach(async () => {
        alice = await createPlayer(harness, {
            twitchId: `twitch-qu-a-${nextId()}`,
        });
        bruno = await createPlayer(harness, {
            twitchId: `twitch-qu-b-${nextId()}`,
        });
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

    it('publishes the latest state last on back-to-back updates of the same quest', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);
        const onlyAlice = [String(characterIdOf(alice))];

        await quests.updateOne(
            { _id: quest._id },
            {
                $push: {
                    registeredAdventurers: registrationOf(characterIdOf(bruno)),
                },
            },
        );
        await quests.updateOne(
            { _id: quest._id },
            {
                $pull: {
                    registeredAdventurers: { character: characterIdOf(bruno) },
                },
            },
        );

        let seen = charactersOf(await nextQuest(subscription));
        if (seen.length > 1) seen = charactersOf(await nextQuest(subscription));
        expect(seen).toEqual(onlyAlice);
        for (const late of await trailingQuests(subscription)) {
            expect(charactersOf(late)).toEqual(onlyAlice);
        }
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

    it('emits the started quest with the placeholder seat when a member is archived («Il BE non libera i posti delle quest avviate»)', async () => {
        const party = [characterIdOf(alice), characterIdOf(bruno)];
        const quest = await persistPartyQuest(party, STARTED_AT);
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);

        await archive(bruno);
        expect(charactersOf(await nextQuest(subscription))).toEqual(
            party.map(String),
        );

        await archive(alice);
        let seen = charactersOf(await nextQuest(subscription));
        if (seen.length > 0) seen = charactersOf(await nextQuest(subscription));
        expect(seen).toEqual([]);
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
        const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        const internal = pubSub.subscribe('questUpdated', String(other._id));
        const published = internal.next();

        try {
            await quests.updateOne(
                { _id: other._id },
                {
                    $push: {
                        registeredAdventurers: registrationOf(
                            characterIdOf(bruno),
                        ),
                    },
                },
            );
            const event = await withTimeout(published, PUBLISHED_WAIT_MS);
            expect(String(event.value?.questUpdated._id)).toBe(
                String(other._id),
            );
        } finally {
            await internal.return?.();
        }
        await expectSilence(subscription);
    });

    it('stops emitting once the quest is concluded and answers NOT_FOUND afterwards', async () => {
        const quest = await persistPartyQuest([characterIdOf(alice)]);
        const subscription = subscribeTo(String(quest._id));
        await nextQuest(subscription);
        // sentinella (Pitfall 12): il publisher ha visto l'update e scartato la quest conclusa
        const discarded = new Promise<void>((resolve) => {
            jest.spyOn(Logger.prototype, 'debug').mockImplementation(
                (message: unknown) => {
                    if (String(message).includes(String(quest._id))) resolve();
                },
            );
        });
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);

        await quests.updateOne(
            { _id: quest._id },
            { $set: { concludedAt: CONCLUDED_AT } },
        );
        await withTimeout(discarded, PUBLISHED_WAIT_MS);
        await expectSilence(subscription);

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
