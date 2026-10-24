import { getQueueToken } from '@nestjs/bull';
import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import { buildCharacter, persistSpell } from '../../test/fixtures';

const MISSING_CHARACTER_ID = '64b0000000000000000000ff';
const MALFORMED_CHARACTER_ID = 'abc';
const FORBIDDEN_MESSAGE = 'Questo personaggio non ti appartiene';

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
    isMutation: boolean;
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
        isMutation: true,
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
        isMutation: true,
        variables: (id) => ({ request: { id, slotType: 'head' } }),
    },
    {
        name: 'equipSpell',
        document:
            'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful } }',
        isMutation: true,
        variables: (id, { spellA }) => ({ request: { id, spellId: spellA } }),
    },
    {
        name: 'unequipSpell',
        document:
            'mutation($request: EquipSpellRequest!) { unequipSpell(request: $request) { successful } }',
        isMutation: true,
        variables: (id, { spellB }) => ({ request: { id, spellId: spellB } }),
    },
    {
        name: 'useSpell',
        document:
            'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful } }',
        isMutation: true,
        variables: (id, { spellB }) => ({
            request: { characterId: id, spellId: spellB },
        }),
    },
    {
        name: 'character',
        document: 'query($id: String!) { character(id: $id) { id } }',
        isMutation: false,
        variables: (id) => ({ id }),
    },
    {
        name: 'equipment',
        document: 'query($id: String!) { equipment(id: $id) { head { id } } }',
        isMutation: false,
        variables: (id) => ({ id }),
    },
];

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function firstErrorOf(response: request.Response): WireError | undefined {
    return bodyOf(response).errors?.[0];
}

describe('Character ownership on mutations and queries (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let spells: Model<SpellDocument>;
    let queue: { add: jest.Mock };

    let spellIds: SpellIds;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let guardia: TestPlayer;
    let oste: TestPlayer;
    let aliceCharId: string;

    function run(
        operation: Operation,
        characterId: string,
        bearer?: string,
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

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        spells = harness.connection.model<SpellDocument>(Spell.name);
        queue = harness.app.get(getQueueToken('spell-recovery'));
    });

    beforeEach(async () => {
        const spellA = await persistSpell(spells, { name: 'Dardo' });
        const spellB = await persistSpell(spells, { name: 'Scudo' });
        spellIds = { spellA: String(spellA._id), spellB: String(spellB._id) };
        const richCharacter = {
            status: {
                ...buildCharacter().status,
                title: 'mage',
                xp: 25000,
                spells: [spellA._id, spellB._id],
            },
            assets: {
                ...buildCharacter().assets,
                activeSpells: [{ spell: spellB._id, usages: 1 }],
            },
        };
        alice = await createPlayer(harness, {
            twitchId: 'twitch-own-alice',
            characterOverrides: richCharacter,
        });
        bruno = await createPlayer(harness, {
            twitchId: 'twitch-own-bruno',
            characterOverrides: richCharacter,
        });
        guardia = await createPlayer(harness, {
            twitchId: 'twitch-own-guard',
            role: RoleType.guard,
        });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-own-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        aliceCharId = String(alice.character?._id);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it.each(OPERATIONS)(
        '$name forbids another adventurer and leaves the document untouched',
        async (operation) => {
            const before = await rawCharacter(aliceCharId);

            const response = await run(operation, aliceCharId, bruno.bearer);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'FORBIDDEN',
            });
            expect(firstErrorOf(response)?.message).toBe(FORBIDDEN_MESSAGE);
            expect(await rawCharacter(aliceCharId)).toEqual(before);
        },
    );

    it.each(OPERATIONS)(
        "$name forbids the guard on someone else's character",
        async (operation) => {
            const response = await run(operation, aliceCharId, guardia.bearer);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'FORBIDDEN',
            });
        },
    );

    it.each(OPERATIONS)('$name succeeds for the owner', async (operation) => {
        const response = await run(operation, aliceCharId, alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        if (operation.isMutation) {
            expect(bodyOf(response).data?.[operation.name]).toEqual({
                successful: true,
            });
        }
    });

    it.each(OPERATIONS)(
        '$name lets the innkeeper act on behalf of the owner',
        async (operation) => {
            const response = await run(operation, aliceCharId, oste.bearer);

            expect(bodyOf(response).errors).toBeUndefined();
        },
    );

    it.each(OPERATIONS)(
        '$name answers a typed NOT_FOUND to the adventurer for unknown or malformed ids',
        async (operation) => {
            for (const id of [MISSING_CHARACTER_ID, MALFORMED_CHARACTER_ID]) {
                const response = await run(operation, id, bruno.bearer);

                expect(firstErrorOf(response)?.extensions).toEqual({
                    code: 'NOT_FOUND',
                });
            }
        },
    );

    it.each(OPERATIONS)(
        '$name answers a typed NOT_FOUND to the innkeeper for an unknown id',
        async (operation) => {
            const response = await run(
                operation,
                MISSING_CHARACTER_ID,
                oste.bearer,
            );

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'NOT_FOUND',
            });
        },
    );

    describe('characters (list)', () => {
        const CHARACTERS = '{ characters { id } }';

        it.each([
            ['adventurer', () => bruno.bearer],
            ['guard', () => guardia.bearer],
        ])('forbids the %s', async (_role, bearerOf) => {
            const response = await graphqlRequest(
                harness.app,
                CHARACTERS,
                undefined,
                bearerOf(),
            );

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: 'FORBIDDEN',
            });
            expect(bodyOf(response).data ?? null).toBeNull();
        });

        it('lists every character to the innkeeper', async () => {
            const response = await graphqlRequest(
                harness.app,
                CHARACTERS,
                undefined,
                oste.bearer,
            );

            expect(bodyOf(response).errors).toBeUndefined();
            const ids = (bodyOf(response).data?.characters as { id: string }[])
                .map(({ id }) => id)
                .sort();
            expect(ids).toEqual(
                [alice, bruno, guardia]
                    .map((player) => String(player.character?._id))
                    .sort(),
            );
        });

        it('stays unauthenticated without a bearer', async () => {
            const response = await graphqlRequest(harness.app, CHARACTERS);

            expect(firstErrorOf(response)?.extensions).toEqual({
                code: AuthErrorCode.UNAUTHENTICATED,
            });
        });
    });

    it('queues the spell recovery when the innkeeper uses a spell on behalf of the owner', async () => {
        const useSpell = OPERATIONS.find(({ name }) => name === 'useSpell')!;

        const response = await run(useSpell, aliceCharId, oste.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(queue.add).toHaveBeenCalledTimes(1);
        expect(queue.add).toHaveBeenCalledWith(
            'recover',
            { characterId: aliceCharId, spellId: spellIds.spellB },
            expect.any(Object),
        );
    });
});
