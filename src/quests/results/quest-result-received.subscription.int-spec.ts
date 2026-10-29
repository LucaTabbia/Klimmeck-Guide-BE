import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../../test/auth/ws-test-client';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { primeQuestResultsChangeStream } from '../../../test/quests/quest-results-change-stream';
import { persistQuestResult } from '../../../test/quests/quest-result.fixture';
import type { PubSub } from '@graphql-yoga/subscription';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { withTimeout } from '../../../test/auth/ws-test-client';

const CONFIRM =
    'mutation Confirm($id: String!) { acknowledgeQuestResult(id: $id) { successful } }';
const QUEST_RESULT_RECEIVED =
    'subscription OnQuestResult($characterId: String!) { questResultReceived(characterId: $characterId) { id outcome hpAfter acknowledgedAt quest { title } } }';
// nessuno snapshot: la finestra di silenzio lascia anche aprire la subscription prima della prima scrittura
const NO_SNAPSHOT_WINDOW_MS = 300;
// l'evento del change stream arriva in modo asincrono: un inserto fatto prima della subscription va atteso sul PubSub
// interno, altrimenti su una CI lenta la subscription lo riceverebbe come finto snapshot
const PUBLISHED_WAIT_MS = 2000;

interface WireQuestResult {
    id: string;
    outcome: string;
    hpAfter: number;
    quest: { title: string };
}

type QuestResultReceived = { questResultReceived: WireQuestResult };
type QuestResultSubscription = OpenSubscription<QuestResultReceived>;
type PendingResult = ReturnType<QuestResultSubscription['next']>;

// avvolto: una funzione async che restituisse la promise pendente la adotterebbe, attendendo l'evento
interface LiveSubscription {
    pending: PendingResult;
}

describe('questResultReceived subscription (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let results: Model<QuestResultDocument>;
    const opened: QuestResultSubscription[] = [];

    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;
    let aliceCharId: string;

    function subscribeTo(
        bearer: string,
        characterId: string,
    ): QuestResultSubscription {
        const subscription = openSubscription<QuestResultReceived>(
            url,
            { Authorization: bearer },
            { query: QUEST_RESULT_RECEIVED, variables: { characterId } },
        );
        opened.push(subscription);
        return subscription;
    }

    // il primo next() apre la connessione (client lazy): resta pendente, e nessuno snapshot deve risolverlo
    async function subscribeWithoutSnapshot(
        bearer: string,
        characterId: string,
    ): Promise<LiveSubscription> {
        const first = subscribeTo(bearer, characterId).next();
        const early = await Promise.race([
            first.then(() => 'received'),
            new Promise<string>((resolve) =>
                setTimeout(() => resolve('silent'), NO_SNAPSHOT_WINDOW_MS),
            ),
        ]);
        expect(early).toBe('silent');
        return { pending: first };
    }

    async function receivedResult({
        pending,
    }: LiveSubscription): Promise<WireQuestResult> {
        const result = await pending;
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.questResultReceived as WireQuestResult;
    }

    async function expectRejection(
        subscription: QuestResultSubscription,
    ): Promise<{ message: string; extensions?: unknown }> {
        const first = await subscription.next();
        expect(first.done).toBe(false);
        expect(first.value.data ?? null).toBeNull();
        expect(first.value.errors).toHaveLength(1);
        const second = await subscription.next();
        expect(second.done).toBe(true);
        return first.value.errors?.[0] as {
            message: string;
            extensions?: unknown;
        };
    }

    function persistResultOf(
        player: TestPlayer,
        overrides: Record<string, unknown> = {},
    ) {
        return persistQuestResult(results, {
            character: player.character?._id,
            user: player.user._id,
            ...overrides,
        });
    }

    // persiste un risultato e attende che il change stream lo abbia pubblicato: solo allora la subscription sotto test può aprirsi
    async function persistPublishedResultOf(player: TestPlayer) {
        const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        const live = pubSub.subscribe('questResultReceived');
        const published = live.next();
        try {
            const persisted = await persistResultOf(player);
            await withTimeout(published, PUBLISHED_WAIT_MS);
            return persisted;
        } finally {
            await live.return?.();
        }
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [QuestResultsModule] });
        url = graphqlWsUrl(harness.port);
        results = harness.app.get<Model<QuestResultDocument>>(
            getModelToken(QuestResult.name),
        );
        await results.createCollection();
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        await primeQuestResultsChangeStream(harness);
        alice = await createPlayer(harness, { twitchId: 'twitch-qrr-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-qrr-bruno' });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-qrr-innkeeper',
            role: RoleType.innkeeper,
        });
        aliceCharId = String(alice.character?._id);
    });

    afterEach(async () => {
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('sends no snapshot and then the full result inserted for the owner', async () => {
        const live = await subscribeWithoutSnapshot(alice.bearer, aliceCharId);

        const inserted = await persistResultOf(alice, {
            hpAfter: 700,
            quest: {
                id: alice.character?._id,
                type: 'job',
                title: 'Bandits at the gate',
            },
        });

        expect(await receivedResult(live)).toEqual({
            id: String(inserted._id),
            outcome: 'success',
            hpAfter: 700,
            acknowledgedAt: null,
            quest: { title: 'Bandits at the gate' },
        });
    });

    it('delivers the new result unconfirmed', async () => {
        const live = await subscribeWithoutSnapshot(alice.bearer, aliceCharId);

        const inserted = await persistResultOf(alice);

        expect(await receivedResult(live)).toMatchObject({
            id: String(inserted._id),
            acknowledgedAt: null,
        });
    });

    it('filters out results of another user, even on the same character', async () => {
        const live = await subscribeWithoutSnapshot(alice.bearer, aliceCharId);

        await persistResultOf(bruno);
        await persistResultOf(alice, { user: bruno.user._id });
        const own = await persistResultOf(alice);

        expect((await receivedResult(live)).id).toBe(String(own._id));
    });

    it('rejects another adventurer subscribing to the character with FORBIDDEN', async () => {
        const error = await expectRejection(
            subscribeTo(bruno.bearer, aliceCharId),
        );

        expect(error.extensions).toEqual({ code: 'FORBIDDEN' });
    });

    it('rejects the innkeeper on a foreign character with FORBIDDEN (no bypass)', async () => {
        const error = await expectRejection(
            subscribeTo(oste.bearer, aliceCharId),
        );

        expect(error.extensions).toEqual({ code: 'FORBIDDEN' });
    });

    it('still delivers the death result after the character was unlinked', async () => {
        const live = await subscribeWithoutSnapshot(alice.bearer, aliceCharId);

        await harness.connection
            .collection('users')
            .updateOne(
                { _id: alice.user._id as Types.ObjectId },
                { $set: { currentCharacter: null } },
            );
        const death = await persistResultOf(alice, {
            outcome: 'death',
            hpAfter: 0,
        });

        expect(await receivedResult(live)).toMatchObject({
            id: String(death._id),
            outcome: 'death',
            hpAfter: 0,
        });
    });

    // D-12: il morto resta corrente fino alla conferma, e la policy accetta il proprietario del personaggio corrente
    it('accepts a new subscribe on the dead character still current and refuses it once the death is confirmed', async () => {
        await harness.connection
            .collection('characters')
            .updateOne(
                { _id: alice.character?._id as Types.ObjectId },
                { $set: { deletedAt: new Date(), deletionReason: 'death' } },
            );

        const live = await subscribeWithoutSnapshot(alice.bearer, aliceCharId);
        const death = await persistResultOf(alice, {
            outcome: 'death',
            hpAfter: 0,
        });
        expect((await receivedResult(live)).id).toBe(String(death._id));

        const confirmed = await graphqlRequest(
            harness.app,
            CONFIRM,
            { id: String(death._id) },
            alice.bearer,
        );
        expect(confirmed.body).toEqual({
            data: { acknowledgeQuestResult: { successful: true } },
        });

        const error = await expectRejection(
            subscribeTo(alice.bearer, aliceCharId),
        );
        expect(error).toMatchObject({
            message: 'Personaggio non trovato',
            extensions: { code: 'NOT_FOUND' },
        });
    });

    it('emits on inserts only, not on updates of an existing result', async () => {
        const existing = await persistPublishedResultOf(alice);
        const live = await subscribeWithoutSnapshot(alice.bearer, aliceCharId);

        await results.updateOne(
            { _id: existing._id },
            { $set: { hpAfter: 1 } },
        );
        const inserted = await persistResultOf(alice);

        expect((await receivedResult(live)).id).toBe(String(inserted._id));
    });
});
