import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { Types, type Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { User, UserDocument } from 'src/models/user.model';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import {
    expectSilence,
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
} from '../../test/auth/ws-test-client';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { primeCharactersChangeStream } from '../../test/characters/characters-change-stream';
import { persistSpell, spellBook } from '../../test/fixtures';

const CHARACTER_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { id status { coins { silver } } } }';

interface WireCharacter {
    id: string;
    status: { coins: { silver: number } };
}

type CharacterUpdatedResult = { characterUpdated: WireCharacter };
type CharacterSubscription = OpenSubscription<CharacterUpdatedResult>;

const CHARACTER_SPELLS_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { status { spellStates { spell { id } usages recoveries } } assets { activeSpells { usages spell { id } } } } }';

const USE_SPELL =
    'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful response } }';

const MINUTE_MS = 60_000;

interface WireSpellCharacter {
    status: {
        spellStates: {
            spell: { id: string };
            usages: number;
            recoveries: string[];
        }[];
    };
    assets: { activeSpells: { usages: number; spell: { id: string } }[] };
}

type SpellsUpdatedResult = { characterUpdated: WireSpellCharacter };
type SpellsSubscription = OpenSubscription<SpellsUpdatedResult>;

function isAscendingFuture(instants: string[], now: number): boolean {
    return instants.every(
        (instant, index) =>
            Date.parse(instant) > now &&
            (index === 0 ||
                Date.parse(instants[index - 1]) <= Date.parse(instant)),
    );
}

describe('characterUpdated subscription (wire)', () => {
    let harness: AuthTestApp;
    let url: string;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let spells: Model<SpellDocument>;
    const opened: { dispose(): Promise<void> }[] = [];

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

    async function nextSpellCharacter(
        subscription: SpellsSubscription,
    ): Promise<WireSpellCharacter> {
        const result = await subscription.next();
        expect(result.done).toBe(false);
        expect(result.value.errors).toBeUndefined();
        return result.value.data?.characterUpdated as WireSpellCharacter;
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
        spells = harness.connection.model<SpellDocument>(Spell.name);
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

    it('rejects a missing id with NOT_FOUND and a malformed one with BAD_USER_INPUT (D-02)', async () => {
        const missing = await expectRejection(
            subscribeTo(bruno.bearer, '64b0000000000000000000ff'),
        );
        expect(missing.extensions).toEqual({ code: 'NOT_FOUND' });

        const malformed = await expectRejection(
            subscribeTo(bruno.bearer, 'abc'),
        );
        expect(malformed.extensions).toEqual({ code: 'BAD_USER_INPUT' });
        expect(malformed.message).toBe('Input non valido: id');
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

    it('carries the spell states with their future instants in every emission', async () => {
        const spell = await persistSpell(spells, {
            name: 'Dardo',
            maxUsages: 3,
            recoveryTime: 10 * MINUTE_MS,
        });
        const spellId = (spell._id as Types.ObjectId).toHexString();
        const book = spellBook([
            {
                spell: spell._id as Types.ObjectId,
                usages: 1,
                recoveries: [
                    new Date(Date.now() + 2 * MINUTE_MS),
                    new Date(Date.now() + 30 * MINUTE_MS),
                ],
                active: true,
            },
        ]);
        await characters.updateOne(
            { _id: alice.character?._id },
            {
                $set: {
                    'status.spells': book.spells,
                    'status.spellStates': book.spellStates,
                    'assets.activeSpells': book.activeSpells,
                },
            },
        );
        const subscription = openSubscription<SpellsUpdatedResult>(
            url,
            { Authorization: alice.bearer },
            { query: CHARACTER_SPELLS_UPDATED, variables: { id: aliceCharId } },
        );
        opened.push(subscription);

        const snapshot = await nextSpellCharacter(subscription);
        expect(snapshot.status.spellStates).toHaveLength(1);
        expect(snapshot.status.spellStates[0].spell.id).toBe(spellId);
        expect(snapshot.status.spellStates[0].recoveries).toHaveLength(2);
        expect(
            isAscendingFuture(
                snapshot.status.spellStates[0].recoveries,
                Date.now(),
            ),
        ).toBe(true);

        const used = await graphqlRequest(
            harness.app,
            USE_SPELL,
            { request: { characterId: aliceCharId, spellId } },
            alice.bearer,
        );
        expect(used.body).toEqual({
            data: {
                useSpell: {
                    successful: true,
                    response: 'Magia utilizzata con successo',
                },
            },
        });

        // tutte le emissioni fino a quella con l'uso speso: stato e slot coincidono in ognuna
        const emissions = [snapshot];
        let last = snapshot;
        while (last.status.spellStates[0].usages !== 0) {
            last = await nextSpellCharacter(subscription);
            emissions.push(last);
        }
        for (const emission of emissions) {
            expect(emission.assets.activeSpells).toHaveLength(1);
            expect(emission.assets.activeSpells[0].usages).toBe(
                emission.status.spellStates[0].usages,
            );
        }
        expect(last.assets.activeSpells[0]).toEqual({
            usages: 0,
            spell: { id: spellId },
        });
        expect(last.status.spellStates[0].recoveries).toHaveLength(3);
        expect(
            isAscendingFuture(
                last.status.spellStates[0].recoveries,
                Date.now(),
            ),
        ).toBe(true);
    });

    it('keeps the characterUpdated signature unchanged', () => {
        const schema = printSchema(harness.app.get(GraphQLSchemaHost).schema);

        expect(schema).toContain('characterUpdated(id: String!): Character!');
    });
});
