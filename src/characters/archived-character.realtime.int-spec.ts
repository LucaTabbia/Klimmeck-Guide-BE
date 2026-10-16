import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import type { AuthTestApp } from '../../test/auth/auth-test-app';
import {
    expectSilence,
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
    withTimeout,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';

const CHARACTER_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { id status { coins { silver } } } }';

const CHANGE_STREAM_ERROR = 'Errore nel change stream';
const PRIMING_ATTEMPTS = 25;
const PRIMING_WAIT_MS = 200;
const SILENCE_MS = 500;

interface WireCharacter {
    id: string;
    status: { coins: { silver: number } };
}

type CharacterUpdatedResult = { characterUpdated: WireCharacter };
type CharacterSubscription = OpenSubscription<CharacterUpdatedResult>;

// Pitfall 9: il cursore del change stream si apre in modo asincrono; si scrive finché un evento arriva
async function primeCharactersChangeStream(
    harness: AuthTestApp,
): Promise<void> {
    const pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
    const characters = harness.connection.model<CharacterDocument>(
        Character.name,
    );
    const sentinel = await createPlayer(harness, {
        twitchId: 'twitch-sentinel',
    });
    const live = pubSub.subscribe('characterUpdated');
    const received = live.next();
    try {
        for (let attempt = 1; attempt <= PRIMING_ATTEMPTS; attempt++) {
            await characters.updateOne(
                { _id: sentinel.character?._id },
                { $set: { 'status.coins.copper': attempt } },
            );
            const delivered = await withTimeout(
                received,
                PRIMING_WAIT_MS,
            ).catch(() => undefined);
            if (delivered) return;
        }
        throw new Error('change stream on characters never delivered an event');
    } finally {
        await live.return?.();
        await harness.clearDatabase();
    }
}

describe('Archived characters in real time (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let pubSub: PubSub<PubSubEvents>;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let errorSpy: jest.SpyInstance;
    const opened: CharacterSubscription[] = [];

    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;
    let aliceCharId: string;
    let brunoCharId: string;

    function subscribeTo(bearer: string, id: string): CharacterSubscription {
        const subscription = openSubscription<CharacterUpdatedResult>(
            url,
            { Authorization: bearer },
            { query: CHARACTER_UPDATED, variables: { id } },
        );
        opened.push(subscription);
        return subscription;
    }

    async function setSilver(characterId: string, silver: number) {
        await characters.updateOne(
            { _id: characterId },
            { $set: { 'status.coins.silver': silver } },
        );
    }

    async function nextCharacter(
        subscription: CharacterSubscription,
    ): Promise<WireCharacter> {
        const result = await subscription.next();
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.characterUpdated as WireCharacter;
    }

    async function expectRejection(
        subscription: CharacterSubscription,
    ): Promise<{ message: string; path?: unknown; extensions?: unknown }> {
        const first = await subscription.next();
        expect(first.done).toBe(false);
        expect(first.value.data ?? null).toBeNull();
        expect(first.value.errors).toHaveLength(1);
        const second = await subscription.next();
        expect(second.done).toBe(true);
        return first.value.errors?.[0] as {
            message: string;
            path?: unknown;
            extensions?: unknown;
        };
    }

    // stato equivalente a deleteCharacter, senza dipendere dalla mutation (plan 05)
    async function archive(player: TestPlayer): Promise<void> {
        await characters.updateOne(
            { _id: player.character?._id },
            { $set: { deletedAt: new Date(), deletionReason: 'user_request' } },
        );
        await users.updateOne(
            { _id: player.user._id },
            { $set: { currentCharacter: null } },
        );
    }

    function changeStreamErrors(): unknown[][] {
        return errorSpy.mock.calls.filter(
            ([message]) => message === CHANGE_STREAM_ERROR,
        );
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        url = graphqlWsUrl(harness.port);
        pubSub = harness.app.get<PubSub<PubSubEvents>>(PUB_SUB);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        await primeCharactersChangeStream(harness);
    });

    beforeEach(async () => {
        errorSpy = jest.spyOn(Logger.prototype, 'error');
        alice = await createPlayer(harness, { twitchId: 'twitch-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-bruno' });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-oste',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        aliceCharId = String(alice.character?._id);
        brunoCharId = String(bruno.character?._id);
    });

    afterEach(async () => {
        errorSpy.mockRestore();
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('the archiving update emits no characterUpdated', async () => {
        const osteOnAlice = subscribeTo(oste.bearer, aliceCharId);
        const osteOnBruno = subscribeTo(oste.bearer, brunoCharId);
        const aliceOnAlice = subscribeTo(alice.bearer, aliceCharId);
        await nextCharacter(osteOnAlice);
        await nextCharacter(osteOnBruno);
        await nextCharacter(aliceOnAlice);

        await archive(alice);
        await setSilver(brunoCharId, 7);

        expect((await nextCharacter(osteOnBruno)).status.coins.silver).toBe(7);
        await expectSilence(osteOnAlice, SILENCE_MS);
        await expectSilence(aliceOnAlice, SILENCE_MS);
        expect(changeStreamErrors()).toHaveLength(0);
    });

    it('later writes to an archived character stay silent', async () => {
        await archive(alice);
        const osteOnBruno = subscribeTo(oste.bearer, brunoCharId);
        await nextCharacter(osteOnBruno);
        const live = pubSub.subscribe('characterUpdated');
        const first = live.next();
        try {
            await setSilver(aliceCharId, 9);
            await setSilver(brunoCharId, 3);

            expect((await nextCharacter(osteOnBruno)).status.coins.silver).toBe(
                3,
            );
            const delivered = await withTimeout(first, 5000);
            expect(delivered.done).toBe(false);
            expect(delivered.value.characterUpdated.id).toBe(brunoCharId);
            await expect(withTimeout(live.next(), SILENCE_MS)).rejects.toThrow(
                'timed out',
            );
            expect(changeStreamErrors()).toHaveLength(0);
        } finally {
            await live.return?.();
        }
    });

    it.each([
        ['its former owner', () => alice],
        ['another adventurer', () => bruno],
        ['the innkeeper', () => oste],
    ])(
        'rejects characterUpdated on an archived id with NOT_FOUND for %s',
        async (_name, player) => {
            await archive(alice);

            const error = await expectRejection(
                subscribeTo(player().bearer, aliceCharId),
            );

            expect(error.extensions).toEqual({ code: 'NOT_FOUND' });
            expect(error.path).toEqual(['characterUpdated']);
        },
    );
});
