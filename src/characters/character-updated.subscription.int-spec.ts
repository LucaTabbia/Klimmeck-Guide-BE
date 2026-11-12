import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { Types, type Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { Pet } from 'src/models/pet.model';
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
import {
    characterTouch,
    primeChangeStream,
} from '../../test/harness/prime-change-stream';
import { persistSpell, spellStatesOf } from '../../test/fixtures';
import { buildOwnedPet } from '../../test/fixtures/owned-pet.fixture';
import { persistPet } from '../../test/fixtures/pet.fixture';

const CHARACTER_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { id status { coins { silver } } } }';

interface WireCharacter {
    id: string;
    status: { coins: { silver: number } };
}

type CharacterUpdatedResult = { characterUpdated: WireCharacter };
type CharacterSubscription = OpenSubscription<CharacterUpdatedResult>;

const CHARACTER_SPELLS_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { status { spellStates { active spell { id } usages recoveries } } } }';

const EQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful response } }';

const USE_SPELL =
    'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful response } }';

const CHARACTER_PETS_SELECTION =
    'assets { pet { id name speedModifier } ownedPets { pet { id name speedModifier sellable } xp currentLifePoints } }';

const CHARACTER_PETS_UPDATED = `subscription OnCharacter($id: String!) { characterUpdated(id: $id) { ${CHARACTER_PETS_SELECTION} } }`;

const CHARACTER_PETS_QUERY = `query Character($id: String!) { character(id: $id) { ${CHARACTER_PETS_SELECTION} } }`;

interface WirePet {
    id: string;
    name: string;
    speedModifier: number | null;
    sellable?: boolean | null;
}

interface WireOwnedPet {
    pet: WirePet;
    xp: number;
    currentLifePoints: number;
}

interface WirePetsCharacter {
    assets: { pet: WirePet | null; ownedPets: WireOwnedPet[] };
}

type PetsUpdatedResult = { characterUpdated: WirePetsCharacter };

const CHARACTER_LORE_QUERY =
    'query Character($id: String!) { character(id: $id) { status { unlockedLore } } }';

const CHARACTER_KNOWN_ENEMIES_QUERY =
    'query Character($id: String!) { character(id: $id) { status { knownEnemies } } }';

const CHARACTER_LORE_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { status { unlockedLore } } }';

type LoreUpdatedResult = {
    characterUpdated: { status: { unlockedLore: string[] } };
};

const CHARACTER_SLOTS_UPDATED =
    'subscription OnCharacter($id: String!) { characterUpdated(id: $id) { status { maxActiveSpells } } }';

type SlotsUpdatedResult = {
    characterUpdated: { status: { maxActiveSpells: number } };
};

const MINUTE_MS = 60_000;

interface WireSpellCharacter {
    status: {
        spellStates: {
            spell: { id: string };
            usages: number;
            recoveries: string[];
            active: boolean;
        }[];
    };
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

    async function giveAliceTheTravelPets(): Promise<{
        cavalloId: string;
        gattoId: string;
    }> {
        const pets = harness.connection.model(Pet.name);
        const cavallo = await persistPet(pets, {
            name: 'Cavallo da viaggio',
            speedModifier: 2,
        });
        const gatto = await persistPet(pets, {
            name: 'Gatto',
            speedModifier: null,
        });
        await characters.updateOne(
            { _id: alice.character?._id },
            {
                $set: {
                    'assets.pet': cavallo._id,
                    'assets.ownedPets': [
                        buildOwnedPet(cavallo._id as Types.ObjectId, {
                            xp: 12,
                            currentLifePoints: 80,
                        }),
                        buildOwnedPet(gatto._id as Types.ObjectId),
                    ],
                },
            },
        );
        return { cavalloId: String(cavallo._id), gattoId: String(gatto._id) };
    }

    function expectedPetsAssets(cavalloId: string, gattoId: string) {
        return {
            pet: {
                id: cavalloId,
                name: 'Cavallo da viaggio',
                speedModifier: 2,
            },
            ownedPets: [
                {
                    pet: {
                        id: cavalloId,
                        name: 'Cavallo da viaggio',
                        speedModifier: 2,
                        sellable: null,
                    },
                    xp: 12,
                    currentLifePoints: 80,
                },
                {
                    pet: {
                        id: gattoId,
                        name: 'Gatto',
                        speedModifier: null,
                        sellable: null,
                    },
                    xp: 0,
                    currentLifePoints: 10,
                },
            ],
        };
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
        await primeChangeStream(
            harness,
            'characterUpdated',
            characterTouch(harness),
        );
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
        // la sola lista delle voci (D-07): la magia è conosciuta ma non ancora equipaggiata
        await characters.updateOne(
            { _id: alice.character?._id },
            {
                $set: {
                    'status.title': 'mage',
                    'status.xp': 20000,
                    'status.spellStates': spellStatesOf([
                        {
                            spell: spell._id as Types.ObjectId,
                            usages: 1,
                            recoveries: [
                                new Date(Date.now() + 2 * MINUTE_MS),
                                new Date(Date.now() + 30 * MINUTE_MS),
                            ],
                        },
                    ]),
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
        expect(snapshot.status.spellStates[0].active).toBe(false);

        const equipped = await graphqlRequest(
            harness.app,
            EQUIP_SPELL,
            { request: { id: aliceCharId, spellId } },
            alice.bearer,
        );
        expect(equipped.body).toEqual({
            data: {
                equipSpell: {
                    successful: true,
                    response: 'Magia equipaggiata con successo',
                },
            },
        });
        // dopo equipSpell la voce è attiva, con gli usi che aveva (D-07)
        let afterEquip = snapshot;
        while (!afterEquip.status.spellStates[0].active)
            afterEquip = await nextSpellCharacter(subscription);
        expect(afterEquip.status.spellStates).toMatchObject([
            { active: true, usages: 1, spell: { id: spellId } },
        ]);

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

        // tutte le emissioni fino a quella con l'uso speso: la voce resta l'unica ed equipaggiata in ognuna
        const emissions = [afterEquip];
        let last = afterEquip;
        while (last.status.spellStates[0].usages !== 0) {
            last = await nextSpellCharacter(subscription);
            emissions.push(last);
        }
        for (const emission of emissions) {
            expect(emission.status.spellStates).toHaveLength(1);
            expect(emission.status.spellStates[0].active).toBe(true);
        }
        expect(last.status.spellStates[0]).toMatchObject({
            active: true,
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

    it('carries the equipped and the owned pets populated in the snapshot (D-13, D-23)', async () => {
        const { cavalloId, gattoId } = await giveAliceTheTravelPets();
        const subscription = openSubscription<PetsUpdatedResult>(
            url,
            { Authorization: alice.bearer },
            { query: CHARACTER_PETS_UPDATED, variables: { id: aliceCharId } },
        );
        opened.push(subscription);

        const snapshot = await subscription.next();

        expect(snapshot).toEqual({
            done: false,
            value: {
                data: {
                    characterUpdated: {
                        assets: expectedPetsAssets(cavalloId, gattoId),
                    },
                },
            },
        });
    });

    it('serves the owned pets with the character query (D-23)', async () => {
        const { cavalloId, gattoId } = await giveAliceTheTravelPets();

        const served = await graphqlRequest(
            harness.app,
            CHARACTER_PETS_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );

        expect(served.body).toEqual({
            data: {
                character: { assets: expectedPetsAssets(cavalloId, gattoId) },
            },
        });
    });

    it('serves the state of an owned pet and hides an orphan entry (D-03, D-23)', async () => {
        const cavallo = await persistPet(harness.connection.model(Pet.name), {
            name: 'Cavallo da viaggio',
            speedModifier: 2,
        });
        const owned = [
            buildOwnedPet(cavallo._id as Types.ObjectId, {
                xp: 12,
                currentLifePoints: 80,
            }),
            buildOwnedPet(new Types.ObjectId(), { currentLifePoints: 0 }),
        ];
        await characters.updateOne(
            { _id: alice.character?._id },
            { $set: { 'assets.ownedPets': owned } },
        );

        const served = await graphqlRequest(
            harness.app,
            CHARACTER_PETS_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );

        expect(served.body).toEqual({
            data: {
                character: {
                    assets: {
                        pet: null,
                        ownedPets: [
                            {
                                pet: {
                                    id: String(cavallo._id),
                                    name: 'Cavallo da viaggio',
                                    speedModifier: 2,
                                    sellable: null,
                                },
                                xp: 12,
                                currentLifePoints: 80,
                            },
                        ],
                    },
                },
            },
        });
        const raw = await characters.collection.findOne({
            _id: alice.character?._id as Types.ObjectId,
        });
        expect(raw?.assets.ownedPets).toEqual(owned);
    });

    // uno script col driver nativo salta i validatori: numeri nulli, assenti o frazionari, ref non leggibile
    async function giveAliceBrokenOwnedPets(): Promise<WireOwnedPet[]> {
        const pets = harness.connection.model(Pet.name);
        const named = async (name: string) =>
            (await persistPet(pets, { name, speedModifier: null }))
                ._id as Types.ObjectId;
        const [cavallo, gatto, gufo] = [
            await named('Cavallo'),
            await named('Gatto'),
            await named('Gufo'),
        ];
        await characters.collection.updateOne(
            { _id: alice.character?._id as Types.ObjectId },
            {
                $set: {
                    'assets.ownedPets': [
                        { pet: cavallo, xp: null, currentLifePoints: 80 },
                        { pet: gatto, xp: 12 },
                        { pet: 'not-an-id', xp: 1, currentLifePoints: 1 },
                        { pet: gufo, xp: 120.5, currentLifePoints: -4 },
                    ],
                },
            },
        );
        const served = (id: Types.ObjectId, name: string) => ({
            id: String(id),
            name,
            speedModifier: null,
            sellable: null,
        });
        return [
            { pet: served(cavallo, 'Cavallo'), xp: 0, currentLifePoints: 80 },
            { pet: served(gatto, 'Gatto'), xp: 12, currentLifePoints: 0 },
            { pet: served(gufo, 'Gufo'), xp: 120, currentLifePoints: 0 },
        ];
    }

    it('serves a broken owned pet entry with valid amounts instead of nulling the character (D-03, D-23)', async () => {
        const ownedPets = await giveAliceBrokenOwnedPets();

        const served = await graphqlRequest(
            harness.app,
            CHARACTER_PETS_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );

        expect(served.body).toEqual({
            data: { character: { assets: { pet: null, ownedPets } } },
        });
    });

    it('carries a broken owned pet entry with valid amounts in the snapshot (D-03, D-23)', async () => {
        const ownedPets = await giveAliceBrokenOwnedPets();
        const subscription = openSubscription<PetsUpdatedResult>(
            url,
            { Authorization: alice.bearer },
            { query: CHARACTER_PETS_UPDATED, variables: { id: aliceCharId } },
        );
        opened.push(subscription);

        const snapshot = await subscription.next();

        expect(snapshot).toEqual({
            done: false,
            value: {
                data: {
                    characterUpdated: { assets: { pet: null, ownedPets } },
                },
            },
        });
    });

    it('serves a legacy character without owned pets as an empty list (D-13, D-23)', async () => {
        await characters.collection.updateOne(
            { _id: alice.character?._id as Types.ObjectId },
            { $unset: { 'assets.ownedPets': '' } },
        );

        const served = await graphqlRequest(
            harness.app,
            CHARACTER_PETS_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );

        expect(served.body).toEqual({
            data: { character: { assets: { pet: null, ownedPets: [] } } },
        });
    });

    it('serves the unlocked lore ids with the character and never the known enemies (D-01)', async () => {
        const loreId = new Types.ObjectId();
        await characters.collection.updateOne(
            { _id: alice.character?._id as Types.ObjectId },
            {
                $set: {
                    'status.unlockedLore': [loreId],
                    'status.knownEnemies': [new Types.ObjectId()],
                },
            },
        );

        const served = await graphqlRequest(
            harness.app,
            CHARACTER_LORE_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );
        const rejected = await graphqlRequest(
            harness.app,
            CHARACTER_KNOWN_ENEMIES_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );

        expect(served.body).toEqual({
            data: {
                character: {
                    status: { unlockedLore: [loreId.toHexString()] },
                },
            },
        });
        expect(rejected.body.data).toBeUndefined();
        expect(rejected.body.errors[0].message).toContain('knownEnemies');
    });

    it('serves a legacy character without unlocked lore as an empty list (D-01)', async () => {
        await characters.collection.updateOne(
            { _id: alice.character?._id as Types.ObjectId },
            {
                $unset: {
                    'status.unlockedLore': '',
                    'status.knownEnemies': '',
                },
            },
        );

        const served = await graphqlRequest(
            harness.app,
            CHARACTER_LORE_QUERY,
            { id: aliceCharId },
            alice.bearer,
        );

        expect(served.body).toEqual({
            data: { character: { status: { unlockedLore: [] } } },
        });
    });

    it('re-emits the character when its unlocked lore grows (D-01)', async () => {
        const loreId = new Types.ObjectId();
        const subscription = openSubscription<LoreUpdatedResult>(
            url,
            { Authorization: alice.bearer },
            { query: CHARACTER_LORE_UPDATED, variables: { id: aliceCharId } },
        );
        opened.push(subscription);

        const snapshot = await subscription.next();
        expect(snapshot.value.errors).toBeUndefined();

        await characters.collection.updateOne(
            { _id: alice.character?._id as Types.ObjectId },
            { $addToSet: { 'status.unlockedLore': loreId } },
        );

        expect(await subscription.next()).toEqual({
            done: false,
            value: {
                data: {
                    characterUpdated: {
                        status: { unlockedLore: [loreId.toHexString()] },
                    },
                },
            },
        });
    });

    it('serves the computed max active spells on the character stream (D-08)', async () => {
        const subscription = openSubscription<SlotsUpdatedResult>(
            url,
            { Authorization: alice.bearer },
            { query: CHARACTER_SLOTS_UPDATED, variables: { id: aliceCharId } },
        );
        opened.push(subscription);

        expect(await subscription.next()).toEqual({
            done: false,
            value: {
                data: { characterUpdated: { status: { maxActiveSpells: 0 } } },
            },
        });

        await characters.updateOne(
            { _id: alice.character?._id },
            { $set: { 'status.title': TitleType.mage } },
        );

        expect(await subscription.next()).toEqual({
            done: false,
            value: {
                data: { characterUpdated: { status: { maxActiveSpells: 1 } } },
            },
        });
    });

    it('keeps the characterUpdated signature unchanged', () => {
        const schema = printSchema(harness.app.get(GraphQLSchemaHost).schema);

        expect(schema).toContain('characterUpdated(id: String!): Character!');
    });
});
