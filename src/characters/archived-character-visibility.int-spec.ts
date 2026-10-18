import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { User, UserDocument } from 'src/models/user.model';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { buildCharacter, persistSpell } from '../../test/fixtures';

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: WireError[];
}

interface SpellIds {
    spellA: string;
    spellB: string;
}

interface Operation {
    name: string;
    document: string;
    variables: (
        characterId: string,
        spells: SpellIds,
    ) => Record<string, unknown>;
}

const OPERATIONS: Operation[] = [
    {
        name: 'doTransaction',
        document:
            'mutation($request: TransactionRequest!) { doTransaction(request: $request) { successful } }',
        variables: (id) => ({
            request: {
                id,
                boughtItems: { equipAssets: [], lootAssets: [] },
                soldItems: { equipAssets: [], lootAssets: [] },
                total: { gold: 0, silver: 0, copper: 0 },
                isTotalPositive: false,
            },
        }),
    },
    {
        name: 'equipItem',
        document:
            'mutation($request: EquipItemRequest!) { equipItem(request: $request) { successful } }',
        variables: (id) => ({ request: { id, slotType: 'head' } }),
    },
    {
        name: 'equipSpell',
        document:
            'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful } }',
        variables: (id, { spellA }) => ({ request: { id, spellId: spellA } }),
    },
    {
        name: 'unequipSpell',
        document:
            'mutation($request: EquipSpellRequest!) { unequipSpell(request: $request) { successful } }',
        variables: (id, { spellB }) => ({ request: { id, spellId: spellB } }),
    },
    {
        name: 'useSpell',
        document:
            'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful } }',
        variables: (id, { spellB }) => ({
            request: { characterId: id, spellId: spellB },
        }),
    },
    {
        name: 'character',
        document: 'query($id: String!) { character(id: $id) { id } }',
        variables: (id) => ({ id }),
    },
    {
        name: 'equipment',
        document: 'query($id: String!) { equipment(id: $id) { head { id } } }',
        variables: (id) => ({ id }),
    },
];

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function firstErrorOf(response: request.Response): WireError | undefined {
    return bodyOf(response).errors?.[0];
}

// un archiviato risponde come un id inesistente su ogni percorso e per ogni ruolo (03.1 D-06)
describe('Archived characters on player paths (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let users: Model<UserDocument>;
    let spells: Model<SpellDocument>;

    let spellIds: SpellIds;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;
    let aliceCharId: string;
    let brunoCharId: string;

    function run(
        operation: Operation,
        characterId: string,
        bearer: string,
    ): Promise<request.Response> {
        return graphqlRequest(
            harness.app,
            operation.document,
            operation.variables(characterId, spellIds),
            bearer,
        );
    }

    function rawCharacter(id: string): Promise<unknown> {
        return characters.collection.findOne({ _id: new Types.ObjectId(id) });
    }

    async function archiveDocument(player: TestPlayer): Promise<void> {
        await characters.updateOne(
            { _id: player.character!._id },
            { $set: { deletedAt: new Date(), deletionReason: 'user_request' } },
        );
    }

    // stato equivalente a deleteCharacter, senza dipendere dalla mutation
    async function archive(player: TestPlayer): Promise<void> {
        await archiveDocument(player);
        await users.updateOne(
            { _id: player.user._id },
            { $set: { currentCharacter: null } },
        );
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        users = harness.connection.model<UserDocument>(User.name);
        spells = harness.connection.model<SpellDocument>(Spell.name);
    });

    beforeEach(async () => {
        const spellA = await persistSpell(spells, { name: 'Dardo' });
        const spellB = await persistSpell(spells, { name: 'Scudo' });
        spellIds = { spellA: String(spellA._id), spellB: String(spellB._id) };
        const richCharacter = {
            status: {
                ...buildCharacter().status,
                xp: 25000,
                spells: [spellA._id, spellB._id],
            },
            assets: {
                ...buildCharacter().assets,
                activeSpells: [{ spell: spellB._id, usages: 1 }],
            },
        };
        alice = await createPlayer(harness, {
            twitchId: 'twitch-arch-alice',
            characterOverrides: richCharacter,
        });
        bruno = await createPlayer(harness, {
            twitchId: 'twitch-arch-bruno',
            characterOverrides: richCharacter,
        });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-arch-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        aliceCharId = String(alice.character!._id);
        brunoCharId = String(bruno.character!._id);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it.each(OPERATIONS)(
        '$name answers NOT_FOUND on an archived character for its former owner',
        async (operation) => {
            await archive(alice);
            const before = await rawCharacter(aliceCharId);

            const response = await run(operation, aliceCharId, alice.bearer);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'NOT_FOUND',
            });
            expect(await rawCharacter(aliceCharId)).toEqual(before);
        },
    );

    it.each(OPERATIONS)(
        '$name answers NOT_FOUND on an archived character for another adventurer',
        async (operation) => {
            await archive(alice);
            const before = await rawCharacter(aliceCharId);

            const response = await run(operation, aliceCharId, bruno.bearer);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'NOT_FOUND',
            });
            expect(await rawCharacter(aliceCharId)).toEqual(before);
        },
    );

    it.each(OPERATIONS)(
        '$name answers NOT_FOUND on an archived character for the innkeeper',
        async (operation) => {
            await archive(alice);
            const before = await rawCharacter(aliceCharId);

            const response = await run(operation, aliceCharId, oste.bearer);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'NOT_FOUND',
            });
            expect(await rawCharacter(aliceCharId)).toEqual(before);
        },
    );

    it.each(OPERATIONS)(
        '$name answers NOT_FOUND to a user still pointing at an archived character',
        async (operation) => {
            await archiveDocument(alice);
            const before = await rawCharacter(aliceCharId);

            const response = await run(operation, aliceCharId, alice.bearer);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'NOT_FOUND',
            });
            expect(await rawCharacter(aliceCharId)).toEqual(before);
        },
    );

    it('resolves me.currentCharacter to null for a user still pointing at an archived character', async () => {
        await archiveDocument(alice);

        const response = await graphqlRequest(
            harness.app,
            '{ me { currentCharacter { id } } }',
            undefined,
            alice.bearer,
        );

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.me).toEqual({ currentCharacter: null });
    });

    it('hides archived characters from the innkeeper list', async () => {
        await archive(alice);

        const response = await graphqlRequest(
            harness.app,
            '{ characters { id } }',
            undefined,
            oste.bearer,
        );

        expect(bodyOf(response).errors).toBeUndefined();
        const ids = (bodyOf(response).data?.characters as { id: string }[]).map(
            ({ id }) => id,
        );
        expect(ids).toContain(brunoCharId);
        expect(ids).not.toContain(aliceCharId);
    });

    it('keeps legacy characters without the deletedAt field visible', async () => {
        await characters.collection.updateOne(
            { _id: bruno.character!._id },
            { $unset: { deletedAt: '', deletionReason: '' } },
        );
        const character = OPERATIONS.find(({ name }) => name === 'character')!;

        const response = await run(character, brunoCharId, bruno.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect((bodyOf(response).data?.character as { id: string }).id).toBe(
            brunoCharId,
        );
    });
});
