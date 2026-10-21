import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import type { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import type { AuthTestApp } from '../../test/auth/auth-test-app';
import {
    expectSilence,
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { primeCharactersChangeStream } from '../../test/characters/characters-change-stream';

const CHARACTER_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { id status { coins { silver } } } }';

interface WireCharacter {
    id: string;
    status: { coins: { silver: number } };
}

type CharacterUpdatedResult = { characterUpdated: WireCharacter };
type CharacterSubscription = OpenSubscription<CharacterUpdatedResult>;

describe('characterUpdated subscription (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    const opened: CharacterSubscription[] = [];

    let alice: TestPlayer;
    let bruno: TestPlayer;
    let guardia: TestPlayer;
    let oste: TestPlayer;
    let aliceCharId: string;

    function subscribeTo(bearer: string, id: string): CharacterSubscription {
        const subscription = openSubscription<CharacterUpdatedResult>(
            url,
            { Authorization: bearer },
            { query: CHARACTER_UPDATED, variables: { id } },
        );
        opened.push(subscription);
        return subscription;
    }

    async function setSilver(
        characterId: unknown,
        silver: number,
    ): Promise<void> {
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

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        url = graphqlWsUrl(harness.port);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        await primeCharactersChangeStream(harness);
    });

    beforeEach(async () => {
        alice = await createPlayer(harness, { twitchId: 'twitch-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-bruno' });
        guardia = await createPlayer(harness, {
            twitchId: 'twitch-guardia',
            role: RoleType.guard,
        });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-oste',
            role: RoleType.innkeeper,
            withCharacter: false,
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

    it('sends the owner a snapshot of the character and then its changes', async () => {
        const subscription = subscribeTo(alice.bearer, aliceCharId);

        expect(await subscription.next()).toEqual({
            done: false,
            value: {
                data: {
                    characterUpdated: {
                        id: aliceCharId,
                        status: { coins: { silver: 0 } },
                    },
                },
            },
        });

        await setSilver(alice.character?._id, 3);

        expect((await nextCharacter(subscription)).status.coins.silver).toBe(3);
    });

    it("rejects an adventurer subscribing to someone else's character with FORBIDDEN and no snapshot", async () => {
        const error = await expectRejection(
            subscribeTo(bruno.bearer, aliceCharId),
        );

        expect(error.extensions).toEqual({ code: 'FORBIDDEN' });
        expect(error.message).toBe('Questo personaggio non ti appartiene');
        expect(error.path).toEqual(['characterUpdated']);
    });

    it("rejects a guard subscribing to someone else's character with FORBIDDEN", async () => {
        const error = await expectRejection(
            subscribeTo(guardia.bearer, aliceCharId),
        );

        expect(error.extensions).toEqual({ code: 'FORBIDDEN' });
    });

    it('rejects a missing or malformed character id with NOT_FOUND', async () => {
        const missing = await expectRejection(
            subscribeTo(bruno.bearer, '64b0000000000000000000ff'),
        );
        expect(missing.extensions).toEqual({ code: 'NOT_FOUND' });

        const malformed = await expectRejection(
            subscribeTo(bruno.bearer, 'abc'),
        );
        expect(malformed.extensions).toEqual({ code: 'NOT_FOUND' });
    });

    it('lets the innkeeper follow any character', async () => {
        const subscription = subscribeTo(oste.bearer, aliceCharId);

        expect((await nextCharacter(subscription)).id).toBe(aliceCharId);

        await setSilver(alice.character?._id, 4);

        expect((await nextCharacter(subscription)).status.coins.silver).toBe(4);
    });

    it('never delivers the changes of another character', async () => {
        const subscription = subscribeTo(alice.bearer, aliceCharId);
        await nextCharacter(subscription);

        await setSilver(bruno.character?._id, 7);
        await setSilver(alice.character?._id, 8);

        const received = await nextCharacter(subscription);
        expect(received.id).toBe(aliceCharId);
        expect(received.status.coins.silver).toBe(8);
    });

    it('stops the events when the subscriber no longer owns the character', async () => {
        const aliceSubscription = subscribeTo(alice.bearer, aliceCharId);
        const osteSubscription = subscribeTo(oste.bearer, aliceCharId);
        await nextCharacter(aliceSubscription);
        await nextCharacter(osteSubscription);

        await users.updateOne(
            { _id: alice.user._id },
            { $set: { currentCharacter: null } },
        );
        await setSilver(alice.character?._id, 5);

        expect(
            (await nextCharacter(osteSubscription)).status.coins.silver,
        ).toBe(5);
        await expectSilence(aliceSubscription, 500);
    });

    it('sends the state changed while disconnected when subscribing again', async () => {
        const first = subscribeTo(alice.bearer, aliceCharId);
        await nextCharacter(first);
        await first.dispose();

        await setSilver(alice.character?._id, 9);

        const again = subscribeTo(alice.bearer, aliceCharId);
        expect((await nextCharacter(again)).status.coins.silver).toBe(9);
    });

    it('keeps the characterUpdated signature unchanged', () => {
        const schema = printSchema(harness.app.get(GraphQLSchemaHost).schema);

        expect(schema).toContain('characterUpdated(id: String!): Character!');
    });
});
