import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistSpell,
    spellBook,
    SpellBookEntry,
} from '../../../test/fixtures';

const CHARACTER =
    'query($id: String!) { character(id: $id) { status { spells { id } spellStates { spell { id name maxUsages } usages recoveries } } assets { activeSpells { usages spell { id } } } } }';

const MINUTE_MS = 60_000;

interface WireSpellState {
    spell: { id: string; name: string; maxUsages: number };
    usages: number;
    recoveries: string[];
}

interface WireCharacter {
    status: { spells: { id: string }[]; spellStates: WireSpellState[] };
    assets: { activeSpells: { usages: number; spell: { id: string } }[] };
}

interface WireBody {
    data?: { character?: WireCharacter | null } | null;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
}

function fromNow(offsetMs: number): Date {
    return new Date(Date.now() + offsetMs);
}

describe('spell states on the character query (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let spells: Model<SpellDocument>;

    async function catalogSpell(
        name: string,
        maxUsages: number,
    ): Promise<Types.ObjectId> {
        const spell = await persistSpell(spells, { name, maxUsages });
        return spell._id as Types.ObjectId;
    }

    function playerWith(
        twitchId: string,
        entries: SpellBookEntry[],
    ): Promise<TestPlayer> {
        const book = spellBook(entries);
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    spells: book.spells,
                    spellStates: book.spellStates,
                },
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: book.activeSpells,
                },
            },
        });
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    // scrittura raw: lo slot del documento diverge apposta dallo stato o ha un ref legacy a stringa
    async function setSlots(
        player: TestPlayer,
        activeSpells: { spell: Types.ObjectId | string; usages: number }[],
    ): Promise<void> {
        await characters.collection.updateOne(
            { _id: new Types.ObjectId(idOf(player)) },
            { $set: { 'assets.activeSpells': activeSpells } },
        );
    }

    async function queryCharacter(player: TestPlayer): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            CHARACTER,
            { id: idOf(player) },
            player.bearer,
        );
        return response.body as WireBody;
    }

    async function characterOf(player: TestPlayer): Promise<WireCharacter> {
        const body = await queryCharacter(player);
        expect(body.errors).toBeUndefined();
        return body.data?.character as WireCharacter;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        spells = harness.connection.model<SpellDocument>(Spell.name);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('«Il timer di recupero non si interrompe mai»: serves one spell state per known spell, in order, with ascending instants', async () => {
        const a = await catalogSpell('Dardo', 3);
        const b = await catalogSpell('Scudo', 2);
        const aRecoveries = [fromNow(2 * MINUTE_MS), fromNow(30 * MINUTE_MS)];
        const bRecoveries = [fromNow(10 * MINUTE_MS)];
        const player = await playerWith('twitch-wire-mage', [
            { spell: a, usages: 1, recoveries: aRecoveries, active: true },
            { spell: b, usages: 1, recoveries: bRecoveries },
        ]);

        const character = await characterOf(player);

        expect(character.status.spellStates).toEqual([
            {
                spell: { id: a.toHexString(), name: 'Dardo', maxUsages: 3 },
                usages: 1,
                recoveries: aRecoveries.map((instant) => instant.toISOString()),
            },
            {
                spell: { id: b.toHexString(), name: 'Scudo', maxUsages: 2 },
                usages: 1,
                recoveries: bRecoveries.map((instant) => instant.toISOString()),
            },
        ]);
        for (const state of character.status.spellStates) {
            expect(state.recoveries).toHaveLength(
                state.spell.maxUsages - state.usages,
            );
        }
        expect(character.assets.activeSpells).toEqual([
            { usages: 1, spell: { id: a.toHexString() } },
        ]);
    });

    it('serves an empty list of spell states to a character without spells', async () => {
        const player = await playerWith('twitch-wire-empty', []);

        const character = await characterOf(player);

        expect(character.status.spellStates).toEqual([]);
        expect(character.assets.activeSpells).toEqual([]);
    });

    it('keeps the query alive and leaves out the state of a spell deleted from the catalog', async () => {
        const a = await catalogSpell('Dardo', 3);
        const b = await catalogSpell('Scudo', 2);
        const player = await playerWith('twitch-wire-orphan', [
            { spell: a, usages: 3, active: true },
            { spell: b, usages: 0, recoveries: [fromNow(MINUTE_MS)] },
        ]);
        await spells.deleteOne({ _id: b });

        const body = await queryCharacter(player);

        expect(body.errors).toBeUndefined();
        const character = body.data?.character as WireCharacter;
        expect(character.status.spells).toEqual([{ id: a.toHexString() }]);
        expect(character.status.spellStates).toEqual([
            {
                spell: { id: a.toHexString(), name: 'Dardo', maxUsages: 3 },
                usages: 3,
                recoveries: [],
            },
        ]);
    });

    it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: serves the slot usages of the spell state, whatever the mirror says', async () => {
        const a = await catalogSpell('Dardo', 3);
        const player = await playerWith('twitch-wire-mirror', [
            {
                spell: a,
                usages: 1,
                recoveries: [fromNow(MINUTE_MS), fromNow(2 * MINUTE_MS)],
                active: true,
            },
        ]);
        await setSlots(player, [{ spell: a, usages: 3 }]);

        const character = await characterOf(player);

        expect(character.assets.activeSpells).toEqual([
            { usages: 1, spell: { id: a.toHexString() } },
        ]);
        expect(character.status.spellStates[0].usages).toBe(1);
    });

    it('serves a slot stored with a legacy string ref with the usages of its state', async () => {
        const a = await catalogSpell('Dardo', 3);
        const player = await playerWith('twitch-wire-legacy', [
            { spell: a, usages: 2, recoveries: [fromNow(MINUTE_MS)] },
        ]);
        await setSlots(player, [{ spell: a.toHexString(), usages: 3 }]);

        const character = await characterOf(player);

        expect(character.assets.activeSpells).toEqual([
            { usages: 2, spell: { id: a.toHexString() } },
        ]);
    });

    it('serves the slots in their order, not in the order of the known spells', async () => {
        const a = await catalogSpell('Dardo', 3);
        const b = await catalogSpell('Scudo', 2);
        const player = await playerWith('twitch-wire-order', [
            { spell: a, usages: 3, active: true },
            { spell: b, usages: 2, active: true },
        ]);
        await setSlots(player, [
            { spell: b, usages: 2 },
            { spell: a, usages: 3 },
        ]);

        const character = await characterOf(player);

        expect(character.assets.activeSpells).toEqual([
            { usages: 2, spell: { id: b.toHexString() } },
            { usages: 3, spell: { id: a.toHexString() } },
        ]);
    });
});
