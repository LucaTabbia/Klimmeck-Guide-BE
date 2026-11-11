import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { TitleType } from 'src/models/enums/title-type.enum';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistSpell,
    SpellBookEntry,
    spellStatesOf,
} from '../../../test/fixtures';

const CHARACTER =
    'query($id: String!) { character(id: $id) { status { spellStates { active spell { id name maxUsages } usages recoveries } } } }';

const EQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful response } }';

const CHARACTER_SLOTS =
    'query($id: String!) { character(id: $id) { status { maxActiveSpells } } }';

const MINUTE_MS = 60_000;

interface WireSpellState {
    spell: { id: string; name: string; maxUsages: number };
    usages: number;
    recoveries: string[];
    active: boolean;
}

interface WireCharacter {
    status: { spellStates: WireSpellState[] };
}

interface EquippedSpell {
    usages: number;
    spell: { id: string };
}

// quali magie sono equipaggiate, con quanti usi, in che ordine: le voci attive
function equippedOf(character: WireCharacter): EquippedSpell[] {
    return character.status.spellStates
        .filter((state) => state.active)
        .map((state) => ({
            usages: state.usages,
            spell: { id: state.spell.id },
        }));
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

    // le sole voci, nessuna delle due liste vecchie (D-07); da mage: uno slot a 20000 xp
    function playerWith(
        twitchId: string,
        entries: SpellBookEntry[],
        xp = 20000,
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    title: TitleType.mage,
                    xp,
                    spellStates: spellStatesOf(entries),
                },
            },
        });
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
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

    async function slotsOf(player: TestPlayer): Promise<unknown> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            CHARACTER_SLOTS,
            { id: idOf(player) },
            player.bearer,
        );
        return response.body;
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
                active: true,
            },
            {
                spell: { id: b.toHexString(), name: 'Scudo', maxUsages: 2 },
                usages: 1,
                recoveries: bRecoveries.map((instant) => instant.toISOString()),
                active: false,
            },
        ]);
        for (const state of character.status.spellStates) {
            expect(state.recoveries).toHaveLength(
                state.spell.maxUsages - state.usages,
            );
        }
        expect(equippedOf(character)).toEqual([
            { usages: 1, spell: { id: a.toHexString() } },
        ]);
    });

    it('serves an empty list of spell states to a character without spells', async () => {
        const player = await playerWith('twitch-wire-empty', []);

        const character = await characterOf(player);

        expect(character.status.spellStates).toEqual([]);
        expect(equippedOf(character)).toEqual([]);
    });

    it('keeps the query alive and leaves out the state of a spell deleted from the catalog, active or not', async () => {
        const a = await catalogSpell('Dardo', 3);
        const b = await catalogSpell('Scudo', 2);
        const c = await catalogSpell('Lampo', 2);
        const player = await playerWith(
            'twitch-wire-orphan',
            [
                { spell: a, usages: 3, active: true },
                { spell: b, usages: 0, recoveries: [fromNow(MINUTE_MS)] },
                { spell: c, usages: 1, active: true },
            ],
            25000,
        );
        await spells.deleteMany({ _id: { $in: [b, c] } });

        const body = await queryCharacter(player);

        expect(body.errors).toBeUndefined();
        const character = body.data?.character as WireCharacter;
        expect(character.status.spellStates).toEqual([
            {
                spell: { id: a.toHexString(), name: 'Dardo', maxUsages: 3 },
                usages: 3,
                recoveries: [],
                active: true,
            },
        ]);
        expect(equippedOf(character)).toEqual([
            { usages: 3, spell: { id: a.toHexString() } },
        ]);
    });

    it('serves a spell state as active after equipSpell, with the usages of the state (D-07)', async () => {
        const a = await catalogSpell('Dardo', 3);
        const player = await playerWith('twitch-wire-equip', [
            {
                spell: a,
                usages: 1,
                recoveries: [fromNow(MINUTE_MS), fromNow(2 * MINUTE_MS)],
            },
        ]);
        expect(equippedOf(await characterOf(player))).toEqual([]);

        const equipped: request.Response = await graphqlRequest(
            harness.app,
            EQUIP_SPELL,
            { request: { id: idOf(player), spellId: a.toHexString() } },
            player.bearer,
        );

        expect((equipped.body as WireBody).errors).toBeUndefined();
        const character = await characterOf(player);
        expect(character.status.spellStates).toMatchObject([
            { usages: 1, active: true },
        ]);
        expect(equippedOf(character)).toEqual([
            { usages: 1, spell: { id: a.toHexString() } },
        ]);
    });

    it('serves a spell state stored without the flag as not active', async () => {
        const a = await catalogSpell('Dardo', 3);
        const player = await playerWith('twitch-wire-no-flag', []);
        // scrittura raw: una voce scritta prima della revisione dei modelli non ha il flag
        await characters.collection.updateOne(
            { _id: new Types.ObjectId(idOf(player)) },
            {
                $set: {
                    'status.spellStates': [
                        { spell: a, usages: 2, recoveries: [] },
                    ],
                },
            },
        );

        const character = await characterOf(player);

        expect(character.status.spellStates).toMatchObject([
            { usages: 2, active: false },
        ]);
        expect(equippedOf(character)).toEqual([]);
    });

    it('serves the computed max active spells of the character (D-08)', async () => {
        const mage = await createPlayer(harness, {
            twitchId: 'twitch-wire-slots-mage',
            characterOverrides: {
                status: { ...buildCharacter().status, title: TitleType.mage },
            },
        });
        const rookie = await createPlayer(harness, {
            twitchId: 'twitch-wire-slots-rookie',
        });

        expect(await slotsOf(mage)).toEqual({
            data: { character: { status: { maxActiveSpells: 1 } } },
        });
        expect(await slotsOf(rookie)).toEqual({
            data: { character: { status: { maxActiveSpells: 0 } } },
        });
    });

    it('serves the active spell states in the learning order (D-16)', async () => {
        const a = await catalogSpell('Dardo', 3);
        const b = await catalogSpell('Scudo', 2);
        const player = await playerWith(
            'twitch-wire-order',
            [
                { spell: a, usages: 3, active: true },
                { spell: b, usages: 2, active: true },
            ],
            25000,
        );

        const character = await characterOf(player);

        expect(equippedOf(character)).toEqual([
            { usages: 3, spell: { id: a.toHexString() } },
            { usages: 2, spell: { id: b.toHexString() } },
        ]);
    });
});
