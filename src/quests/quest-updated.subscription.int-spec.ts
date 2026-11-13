import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model, Types } from 'mongoose';
import { CharacterArchiveModule } from 'src/characters/deletion/character-archive.module';
import { CharacterArchiver } from 'src/characters/deletion/character-archiver';
import { Character } from 'src/models/character/character.model';
import { Enemy } from 'src/models/enemy.model';
import { LootItem } from 'src/models/loot-item.model';
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
import {
    buildCharacter,
    buildQuest,
    persistEnemy,
    persistLootItem,
} from '../../test/fixtures';
import {
    questTouch,
    primeChangeStream,
} from '../../test/harness/prime-change-stream';

const QUEST_UPDATED =
    'subscription OnQuestUpdated($questId: String!) { questUpdated(questId: $questId) { id registeredAdventurers { character title } requirements { requiredAdventurers { title count } } infos { title } } }';
const QUEST_NO_EFFECT =
    'subscription OnQuestNoEffect($questId: String!) { questUpdated(questId: $questId) { id noEffect } }';
const QUEST_PRIZES =
    'subscription OnQuestPrizes($questId: String!) { questUpdated(questId: $questId) { id prizes { xpPrize randomLoot { quantity } } } }';
const QUEST_ENEMIES =
    'subscription OnQuestEnemies($questId: String!) { questUpdated(questId: $questId) { id infos { enemies { quantity enemy { name } } } } }';
const QUEST_AWAITING_RESCUE =
    'subscription OnQuestAwaitingRescue($questId: String!) { questUpdated(questId: $questId) { id awaitingRescue } }';
const VILLAGE_CURE = { lifePointsShare: 0.5, canHeal: ['deepCut'] };
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

interface WireNoEffect {
    id: string;
    noEffect: boolean;
}

type QuestUpdated = { questUpdated: WireQuest };
type QuestNoEffect = { questUpdated: WireNoEffect };

interface WirePrizes {
    id: string;
    prizes: { xpPrize: number | null; randomLoot: { quantity: number }[] };
}

type QuestPrizes = { questUpdated: WirePrizes };

interface WireAwaitingRescue {
    id: string;
    awaitingRescue: boolean;
}

type QuestAwaitingRescue = { questUpdated: WireAwaitingRescue };
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

    async function expectRejectedWith(
        subscription: QuestUpdatedSubscription,
        code: string,
    ): Promise<string | undefined> {
        const first = await subscription.next();
        expect(first.done).toBe(false);
        expect(first.value.data ?? null).toBeNull();
        expect(first.value.errors).toHaveLength(1);
        expect(first.value.errors?.[0]?.extensions).toEqual({ code });
        const second = await subscription.next();
        expect(second.done).toBe(true);
        return first.value.errors?.[0]?.message;
    }

    async function expectNotFound(
        subscription: QuestUpdatedSubscription,
    ): Promise<void> {
        await expectRejectedWith(subscription, 'NOT_FOUND');
    }

    const characterIdOf = (player: TestPlayer) =>
        player.character?._id as Types.ObjectId;

    function archive(player: TestPlayer) {
        return harness.connection.transaction((session) =>
            harness.app.get(CharacterArchiver).archiveWithinReporting(session, {
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
        await primeChangeStream(harness, 'questUpdated', questTouch(harness));
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

    it('answers BAD_USER_INPUT for a malformed quest id (D-02)', async () => {
        const message = await expectRejectedWith(
            subscribeTo(MALFORMED_QUEST_ID),
            'BAD_USER_INPUT',
        );

        expect(message).toBe('Input non valido: questId');
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

    describe('Quest.noEffect per subscriber', () => {
        function persistHeal() {
            return quests.create(
                buildQuest({
                    infos: {
                        ...buildQuest().infos,
                        type: 'heal',
                        title: `La guaritrice ${nextId()}`,
                    },
                    prizes: { ...buildQuest().prizes, cure: VILLAGE_CURE },
                }),
            );
        }

        function subscribeToNoEffect(
            questId: string,
            bearer: string,
        ): OpenSubscription<QuestNoEffect> {
            const subscription = openSubscription<QuestNoEffect>(
                url,
                { Authorization: bearer },
                { query: QUEST_NO_EFFECT, variables: { questId } },
            );
            opened.push(subscription as unknown as QuestUpdatedSubscription);
            return subscription;
        }

        async function nextNoEffect(
            subscription: OpenSubscription<QuestNoEffect>,
        ): Promise<WireNoEffect> {
            const result = await subscription.next();
            expect(result.done).toBe(false);
            expect(result.value.errors).toBeUndefined();
            return result.value.data?.questUpdated as WireNoEffect;
        }

        function woundWithDeepCut(player: TestPlayer) {
            return harness.connection
                .model(Character.name)
                .collection.updateOne(
                    { _id: characterIdOf(player) },
                    { $set: { 'status.injuries': ['deepCut'] } },
                );
        }

        function retitle(questId: unknown) {
            return quests.updateOne(
                { _id: questId },
                { $set: { 'infos.title': `La guaritrice ${nextId()}` } },
            );
        }

        it('resolves noEffect for each subscriber of the same quest event (D-25)', async () => {
            await woundWithDeepCut(bruno);
            const heal = await persistHeal();
            const id = String(heal._id);
            const seenByAlice = subscribeToNoEffect(id, alice.bearer);
            const seenByBruno = subscribeToNoEffect(id, bruno.bearer);

            expect(await nextNoEffect(seenByAlice)).toEqual({
                id,
                noEffect: true,
            });
            expect(await nextNoEffect(seenByBruno)).toEqual({
                id,
                noEffect: false,
            });

            await retitle(heal._id);

            const [aliceEvent, brunoEvent] = await Promise.all([
                nextNoEffect(seenByAlice),
                nextNoEffect(seenByBruno),
            ]);
            expect(aliceEvent).toEqual({ id, noEffect: true });
            expect(brunoEvent).toEqual({ id, noEffect: false });
        });

        it('resolves noEffect again at every event (D-25)', async () => {
            const heal = await persistHeal();
            const id = String(heal._id);
            const subscription = subscribeToNoEffect(id, alice.bearer);
            expect(await nextNoEffect(subscription)).toEqual({
                id,
                noEffect: true,
            });

            await retitle(heal._id);
            expect(await nextNoEffect(subscription)).toEqual({
                id,
                noEffect: true,
            });

            await woundWithDeepCut(alice);
            await retitle(heal._id);
            expect(await nextNoEffect(subscription)).toEqual({
                id,
                noEffect: false,
            });
        });

        function setLife(player: TestPlayer, currentLifePoints: number) {
            return harness.connection
                .model(Character.name)
                .collection.updateOne(
                    { _id: characterIdOf(player) },
                    { $set: { 'status.currentLifePoints': currentLifePoints } },
                );
        }

        // la memo non deve tenere la vita fra due eventi dello stesso subscriber: tetto 50 su un massimo di 100
        it('resolves noEffect again when only the life changes between events (D-25)', async () => {
            await setLife(alice, 40);
            const heal = await persistHeal();
            const id = String(heal._id);
            const subscription = subscribeToNoEffect(id, alice.bearer);
            expect(await nextNoEffect(subscription)).toEqual({
                id,
                noEffect: false,
            });

            await setLife(alice, 60);
            await retitle(heal._id);
            expect(await nextNoEffect(subscription)).toEqual({
                id,
                noEffect: true,
            });

            await setLife(alice, 40);
            await retitle(heal._id);
            expect(await nextNoEffect(subscription)).toEqual({
                id,
                noEffect: false,
            });
        });
    });

    describe('Quest.prizes per subscriber (D-07, D-22)', () => {
        function subscribeToPrizes(
            questId: string,
            bearer: string,
        ): OpenSubscription<QuestPrizes> {
            const subscription = openSubscription<QuestPrizes>(
                url,
                { Authorization: bearer },
                { query: QUEST_PRIZES, variables: { questId } },
            );
            opened.push(subscription as unknown as QuestUpdatedSubscription);
            return subscription;
        }

        async function nextPrizes(
            subscription: OpenSubscription<QuestPrizes>,
        ): Promise<WirePrizes> {
            const result = await subscription.next();
            expect(result.done).toBe(false);
            expect(result.value.errors).toBeUndefined();
            return result.value.data?.questUpdated as WirePrizes;
        }

        function titledPlayer(title: string): Promise<TestPlayer> {
            return createPlayer(harness, {
                twitchId: `twitch-qu-${title}-${nextId()}`,
                characterOverrides: {
                    status: { ...buildCharacter().status, title },
                },
            });
        }

        function retitle(questId: unknown) {
            return quests.updateOne(
                { _id: questId },
                { $set: { 'infos.title': `Il premio ${nextId()}` } },
            );
        }

        it('keeps the single prize of a solo quest on the event (D-01)', async () => {
            const potion = await persistLootItem(
                harness.connection.model(LootItem.name),
            );
            const hunt = await quests.create(
                buildQuest({
                    infos: {
                        ...buildQuest().infos,
                        title: `La caccia ${nextId()}`,
                    },
                    prizes: {
                        ...buildQuest().prizes,
                        xpPrize: 70,
                        randomLoot: [
                            {
                                itemType: 'LootItem',
                                item: potion._id,
                                quantity: 3,
                            },
                        ],
                    },
                }),
            );
            const id = String(hunt._id);
            const subscription = subscribeToPrizes(id, alice.bearer);
            await nextPrizes(subscription);

            await retitle(hunt._id);

            expect(await nextPrizes(subscription)).toEqual({
                id,
                prizes: { xpPrize: 70, randomLoot: [{ quantity: 3 }] },
            });
        });

        it('resolves the prize block for each subscriber of the same quest event (D-07, D-22)', async () => {
            const mage = await titledPlayer('mage');
            const paladin = await titledPlayer('paladin');
            const boss = await quests.create(
                buildQuest({
                    infos: {
                        ...buildQuest().infos,
                        type: 'boss',
                        title: `Il drago ${nextId()}`,
                    },
                    requirements: {
                        ...buildQuest().requirements,
                        minTitle: 'paladin',
                        requiredAdventurers: [
                            { title: 'mage', count: 1 },
                            { title: 'paladin', count: 1 },
                        ],
                    },
                    prizes: {
                        ...buildQuest().prizes,
                        xpPrize: 10,
                        rankPrizes: [
                            { title: 'mage', xpPrize: 300, randomLoot: [] },
                            { title: 'paladin', xpPrize: 150, randomLoot: [] },
                        ],
                    },
                }),
            );
            const id = String(boss._id);
            const seenByMage = subscribeToPrizes(id, mage.bearer);
            const seenByPaladin = subscribeToPrizes(id, paladin.bearer);
            await nextPrizes(seenByMage);
            await nextPrizes(seenByPaladin);
            const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
            const internal = pubSub.subscribe('questUpdated', id);
            const published = internal.next();

            try {
                await retitle(boss._id);

                const [mageEvent, paladinEvent] = await Promise.all([
                    nextPrizes(seenByMage),
                    nextPrizes(seenByPaladin),
                ]);
                expect(mageEvent).toEqual({
                    id,
                    prizes: { xpPrize: 300, randomLoot: [] },
                });
                expect(paladinEvent).toEqual({
                    id,
                    prizes: { xpPrize: 150, randomLoot: [] },
                });
                const payload = (
                    await withTimeout(published, PUBLISHED_WAIT_MS)
                ).value?.questUpdated;
                expect(payload?.prizes.xpPrize).toBe(10);
                expect(
                    payload?.prizes.rankPrizes?.map(({ title, xpPrize }) => ({
                        title,
                        xpPrize,
                    })),
                ).toEqual([
                    { title: 'mage', xpPrize: 300 },
                    { title: 'paladin', xpPrize: 150 },
                ]);
            } finally {
                await internal.return?.();
            }
        });
    });

    // la nascita e la chiusura dell'aid non toccano il documento d'origine: il publisher lo ripubblica dal change stream, dopo il commit
    describe('a source quest awaiting its rescue (quick 261113-aql)', () => {
        function persistHunt() {
            return quests.create(
                buildQuest({
                    infos: {
                        ...buildQuest().infos,
                        type: 'hunt',
                        title: `La caccia ${nextId()}`,
                    },
                }),
            );
        }

        async function openAidFrom(
            failedQuest: unknown,
        ): Promise<Types.ObjectId> {
            const base = buildQuest();
            const _id = new Types.ObjectId();
            await quests.collection.insertOne({
                ...base,
                _id,
                infos: { ...base.infos, type: 'aid' },
                rescue: { characters: [new Types.ObjectId()], failedQuest },
                concludedAt: null,
            });
            return _id;
        }

        function subscribeToAwaitingRescue(
            questId: string,
        ): OpenSubscription<QuestAwaitingRescue> {
            const subscription = openSubscription<QuestAwaitingRescue>(
                url,
                { Authorization: alice.bearer },
                { query: QUEST_AWAITING_RESCUE, variables: { questId } },
            );
            opened.push(subscription as unknown as QuestUpdatedSubscription);
            return subscription;
        }

        async function nextAwaitingRescue(
            subscription: OpenSubscription<QuestAwaitingRescue>,
        ): Promise<WireAwaitingRescue> {
            const result = await subscription.next(PUBLISHED_WAIT_MS);
            expect(result.done).toBe(false);
            expect(result.value.errors).toBeUndefined();
            return result.value.data?.questUpdated as WireAwaitingRescue;
        }

        it('republishes the hunt when an aid is born from it and when the aid concludes (quick 261113-aql)', async () => {
            const hunt = await persistHunt();
            const id = String(hunt._id);
            const subscription = subscribeToAwaitingRescue(id);
            expect(await nextAwaitingRescue(subscription)).toEqual({
                id,
                awaitingRescue: false,
            });

            const aidId = await openAidFrom(hunt._id);
            expect(await nextAwaitingRescue(subscription)).toEqual({
                id,
                awaitingRescue: true,
            });

            await quests.collection.updateOne(
                { _id: aidId },
                { $set: { concludedAt: CONCLUDED_AT } },
            );
            expect(await nextAwaitingRescue(subscription)).toEqual({
                id,
                awaitingRescue: false,
            });
        });

        it('stays silent on the hunt when an aid of another quest is born (quick 261113-aql)', async () => {
            const hunt = await persistHunt();
            const id = String(hunt._id);
            const subscription = subscribeToAwaitingRescue(id);
            await nextAwaitingRescue(subscription);

            await openAidFrom(new Types.ObjectId());

            await expectSilence(subscription, TRAILING_WINDOW_MS);
        });
    });

    // UAT 2026-11-13: l'aid di una dungeon persa al secondo turno mostra solo il primo gruppo; il payload condiviso tiene i quattro gruppi del DB
    describe('the enemies of a dungeon aid on the event (quick 261113-aql)', () => {
        const GROUP_NAMES = ['Arbusto', 'Ratto', 'Ghoul', 'Drago'];

        interface WireEnemies {
            id: string;
            infos: { enemies: { quantity: number; enemy: { name: string } }[] };
        }

        type QuestEnemies = { questUpdated: WireEnemies };

        async function persistDungeonAid() {
            const enemyModel = harness.connection.model(Enemy.name);
            const groups: { enemy: Types.ObjectId; quantity: number }[] = [];
            for (const [index, name] of GROUP_NAMES.entries()) {
                const enemy = await persistEnemy(enemyModel, { name });
                groups.push({ enemy: enemy._id, quantity: index + 1 });
            }
            return quests.create(
                buildQuest({
                    infos: {
                        ...buildQuest().infos,
                        type: 'aid',
                        title: `Il soccorso ${nextId()}`,
                        enemies: groups,
                    },
                    rescue: {
                        characters: [new Types.ObjectId()],
                        failedQuest: new Types.ObjectId(),
                        turn: { index: 1, kind: 'fight', total: 8 },
                    },
                }),
            );
        }

        function subscribeToEnemies(
            questId: string,
            bearer: string,
        ): OpenSubscription<QuestEnemies> {
            const subscription = openSubscription<QuestEnemies>(
                url,
                { Authorization: bearer },
                { query: QUEST_ENEMIES, variables: { questId } },
            );
            opened.push(subscription as unknown as QuestUpdatedSubscription);
            return subscription;
        }

        async function nextEnemies(
            subscription: OpenSubscription<QuestEnemies>,
        ): Promise<WireEnemies> {
            const result = await subscription.next();
            expect(result.done).toBe(false);
            expect(result.value.errors).toBeUndefined();
            return result.value.data?.questUpdated as WireEnemies;
        }

        it('serves only the group faced up to the saved turn on the snapshot and the event without touching the payload (quick 261113-aql)', async () => {
            const aid = await persistDungeonAid();
            const id = String(aid._id);
            const faced = {
                id,
                infos: {
                    enemies: [{ quantity: 1, enemy: { name: 'Arbusto' } }],
                },
            };
            const seenByAlice = subscribeToEnemies(id, alice.bearer);
            const seenByBruno = subscribeToEnemies(id, bruno.bearer);
            expect(await nextEnemies(seenByAlice)).toEqual(faced);
            expect(await nextEnemies(seenByBruno)).toEqual(faced);
            const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
            const internal = pubSub.subscribe('questUpdated', id);
            const published = internal.next();

            try {
                await quests.updateOne(
                    { _id: aid._id },
                    { $set: { 'infos.title': `Il soccorso ${nextId()}` } },
                );

                const [aliceEvent, brunoEvent] = await Promise.all([
                    nextEnemies(seenByAlice),
                    nextEnemies(seenByBruno),
                ]);
                expect(aliceEvent).toEqual(faced);
                expect(brunoEvent).toEqual(faced);
                const payload = (
                    await withTimeout(published, PUBLISHED_WAIT_MS)
                ).value?.questUpdated;
                expect(payload?.infos.enemies).toHaveLength(4);
            } finally {
                await internal.return?.();
            }
        });
    });
});
