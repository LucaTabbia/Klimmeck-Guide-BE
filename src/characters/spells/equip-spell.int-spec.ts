import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    maxActiveSpellsExpression,
    maxActiveSpellsFor,
} from 'src/models/character/active-spell-slots';
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
    persistCharacter,
    persistSpell,
    spellBook,
    SpellBookEntry,
} from '../../../test/fixtures';
import { migrateLegacyRefs } from '../../../test/migrations/migrate-legacy-refs';

const EQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { equipSpell(request: $request) { successful response } }';
const UNEQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { unequipSpell(request: $request) { successful response } }';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawActiveSpell {
    spell: unknown;
    usages: number;
}

interface RawSpellState {
    spell: unknown;
    usages: number;
    recoveries: Date[];
}

interface RawCharacter {
    status: { spellStates: RawSpellState[] };
    assets: { activeSpells: RawActiveSpell[] };
}

interface Loadout {
    xp: number;
    title?: TitleType;
    book: SpellBookEntry[];
}

const MINUTE_MS = 60 * 1000;

function minutesFromNow(minutes: number): Date {
    return new Date(Date.now() + minutes * MINUTE_MS);
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

function messageOf(body: WireBody): unknown {
    return body.errors?.[0]?.message;
}

function isSuccess(body: WireBody, operation: string): boolean {
    return (
        (body.data?.[operation] as { successful?: boolean } | null)
            ?.successful === true
    );
}

describe('equipSpell / unequipSpell (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let spells: Model<SpellDocument>;

    function playerWith(
        twitchId: string,
        { xp, title = TitleType.mage, book }: Loadout,
    ): Promise<TestPlayer> {
        // le suite delle magie giocano da mage (D-13): gli slot si aprono dal rango mage
        const shelf = spellBook(book);
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    title,
                    xp,
                    spells: shelf.spells,
                    spellStates: shelf.spellStates,
                },
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: shelf.activeSpells,
                },
            },
        });
    }

    async function rawCharacter(id: string): Promise<RawCharacter> {
        return (await characters.collection.findOne({
            _id: new Types.ObjectId(id),
        })) as unknown as RawCharacter;
    }

    async function send(
        document: string,
        player: TestPlayer,
        spellId: string,
        extra: Record<string, unknown> = {},
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            document,
            {
                request: {
                    id: String(player.character?._id),
                    spellId,
                    ...extra,
                },
            },
            player.bearer,
        );
        return response.body as WireBody;
    }

    function equip(
        player: TestPlayer,
        spellId: string,
        extra: Record<string, unknown> = {},
    ): Promise<WireBody> {
        return send(EQUIP_SPELL, player, spellId, extra);
    }

    function unequip(player: TestPlayer, spellId: string): Promise<WireBody> {
        return send(UNEQUIP_SPELL, player, spellId);
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    // scrittura raw: i dati legacy hanno l'id della magia salvato come stringa (04 Pitfall 1)
    async function storeLegacySpells(
        player: TestPlayer,
        legacy: Record<string, unknown>,
    ): Promise<void> {
        await characters.collection.updateOne(
            { _id: new Types.ObjectId(idOf(player)) },
            { $set: legacy },
        );
    }

    async function spellNamed(name: string, maxUsages = 3) {
        return (await persistSpell(spells, { name, maxUsages }))
            ._id as Types.ObjectId;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        spells = harness.connection.model<SpellDocument>(Spell.name);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    describe('equipSpell', () => {
        it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: equips a known spell with the usages of its state, ignoring the client usages', async () => {
            const dardo = await spellNamed('Dardo', 3);
            const player = await playerWith('twitch-eq-state', {
                xp: 20000,
                book: [
                    {
                        spell: dardo,
                        usages: 1,
                        recoveries: [minutesFromNow(2), minutesFromNow(30)],
                    },
                ],
            });
            const before = await rawCharacter(idOf(player));

            const body = await equip(player, dardo.toHexString(), {
                usages: 99,
            });

            expect(body.errors).toBeUndefined();
            expect(body.data?.equipSpell).toEqual({
                successful: true,
                response: 'Magia equipaggiata con successo',
            });
            const raw = await rawCharacter(idOf(player));
            expect(raw.assets.activeSpells).toEqual([
                { spell: dardo, usages: 1 },
            ]);
            expect(raw.status.spellStates).toEqual(before.status.spellStates);
            expect(raw.status.spellStates[0].usages).toBe(1);
            expect(raw.status.spellStates[0].recoveries).toHaveLength(2);
            expect(
                await characters.collection.countDocuments({
                    _id: new Types.ObjectId(idOf(player)),
                    'assets.activeSpells.spell': { $type: 'objectId' },
                }),
            ).toBe(1);
        });

        it('ignores the deprecated usages sent by an old client (D-01)', async () => {
            const dardo = await spellNamed('Dardo', 3);
            const loadout: Loadout = {
                xp: 20000,
                book: [{ spell: dardo, usages: 2 }],
            };
            const oldClient = await playerWith('twitch-eq-old-client', loadout);
            const newClient = await playerWith('twitch-eq-new-client', loadout);

            const withUsages = await equip(oldClient, dardo.toHexString(), {
                usages: 3,
            });
            const withoutUsages = await equip(newClient, dardo.toHexString());

            expect(withUsages).toEqual(withoutUsages);
            const oldRaw = await rawCharacter(idOf(oldClient));
            const newRaw = await rawCharacter(idOf(newClient));
            expect({
                activeSpells: oldRaw.assets.activeSpells,
                spellStates: oldRaw.status.spellStates,
            }).toEqual({
                activeSpells: newRaw.assets.activeSpells,
                spellStates: newRaw.status.spellStates,
            });
            expect(oldRaw.assets.activeSpells).toEqual([
                { spell: dardo, usages: 2 },
            ]);
        });

        it('falls back to the catalog maxUsages when the spell has no state entry', async () => {
            const dardo = await spellNamed('Dardo', 3);
            const player = await playerWith('twitch-eq-no-state', {
                xp: 20000,
                book: [],
            });
            await storeLegacySpells(player, {
                'status.spells': [dardo],
                'status.spellStates': [],
            });

            const body = await equip(player, dardo.toHexString());

            expect(isSuccess(body, 'equipSpell')).toBe(true);
            const raw = await rawCharacter(idOf(player));
            expect(raw.assets.activeSpells).toEqual([
                { spell: dardo, usages: 3 },
            ]);
            expect(raw.status.spellStates).toEqual([]);
        });

        it('rejects an unknown spell with SPELL_NOT_KNOWN and a malformed spell id with BAD_USER_INPUT (D-02)', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-eq-unknown', {
                xp: 20000,
                book: [],
            });
            const before = await rawCharacter(idOf(player));

            const body = await equip(player, dardo.toHexString());

            expect(codeOf(body)).toBe('SPELL_NOT_KNOWN');
            expect(messageOf(body)).toBe('Magia non conosciuta');
            expect(await rawCharacter(idOf(player))).toEqual(before);

            const malformed = await equip(player, 'abc');
            expect(codeOf(malformed)).toBe('BAD_USER_INPUT');
            expect(messageOf(malformed)).toBe('Input non valido: spellId');
            expect(await rawCharacter(idOf(player))).toEqual(before);
        });

        it('rejects an already active spell with SPELL_ALREADY_ACTIVE', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-eq-active', {
                xp: 25000,
                book: [{ spell: dardo, usages: 1, active: true }],
            });
            const before = await rawCharacter(idOf(player));

            const body = await equip(player, dardo.toHexString());

            expect(codeOf(body)).toBe('SPELL_ALREADY_ACTIVE');
            expect(await rawCharacter(idOf(player))).toEqual(before);
        });

        it('rejects a full slot table with MAX_ACTIVE_SPELLS_REACHED', async () => {
            const dardo = await spellNamed('Dardo');
            const scudo = await spellNamed('Scudo');
            const full = await playerWith('twitch-eq-full', {
                xp: 20000,
                book: [
                    { spell: dardo, usages: 1, active: true },
                    { spell: scudo, usages: 3 },
                ],
            });
            const noSlots = await playerWith('twitch-eq-noslots', {
                xp: 19999,
                book: [{ spell: dardo, usages: 3 }],
            });
            const fullBefore = await rawCharacter(idOf(full));
            const noSlotsBefore = await rawCharacter(idOf(noSlots));

            expect(codeOf(await equip(full, scudo.toHexString()))).toBe(
                'MAX_ACTIVE_SPELLS_REACHED',
            );
            expect(codeOf(await equip(noSlots, dardo.toHexString()))).toBe(
                'MAX_ACTIVE_SPELLS_REACHED',
            );
            expect(await rawCharacter(idOf(full))).toEqual(fullBefore);
            expect(await rawCharacter(idOf(noSlots))).toEqual(noSlotsBefore);
        });

        it('rejects equipSpell below the mage rank with MAX_ACTIVE_SPELLS_REACHED', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-eq-rookie', {
                xp: 40000,
                title: TitleType.rookie,
                book: [{ spell: dardo, usages: 3 }],
            });

            const body = await equip(player, dardo.toHexString());

            expect(codeOf(body)).toBe('MAX_ACTIVE_SPELLS_REACHED');
            expect(
                (await rawCharacter(idOf(player))).assets.activeSpells,
            ).toEqual([]);
        });

        it('equips a known spell stored with a legacy string id after the reference migration (D-17d)', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-eq-legacy-known', {
                xp: 20000,
                book: [{ spell: dardo, usages: 3 }],
            });
            await storeLegacySpells(player, {
                'status.spells': [dardo.toHexString()],
            });
            await migrateLegacyRefs(harness.connection);

            const body = await equip(player, dardo.toHexString());

            expect(isSuccess(body, 'equipSpell')).toBe(true);
            expect(
                (await rawCharacter(idOf(player))).assets.activeSpells,
            ).toEqual([{ spell: dardo, usages: 3 }]);
        });

        it('rejects re-equipping a spell active with a legacy string id with SPELL_ALREADY_ACTIVE after the reference migration (D-17d)', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-eq-legacy-active', {
                xp: 25000,
                book: [{ spell: dardo, usages: 1 }],
            });
            await storeLegacySpells(player, {
                'assets.activeSpells': [
                    { spell: dardo.toHexString(), usages: 1 },
                ],
            });
            await migrateLegacyRefs(harness.connection);
            const before = await rawCharacter(idOf(player));

            const body = await equip(player, dardo.toHexString());

            expect(codeOf(body)).toBe('SPELL_ALREADY_ACTIVE');
            expect(await rawCharacter(idOf(player))).toEqual(before);
        });

        it('answers NOT_FOUND for a known spell missing from the catalog', async () => {
            const ghost = new Types.ObjectId();
            const player = await playerWith('twitch-eq-ghost', {
                xp: 20000,
                book: [{ spell: ghost, usages: 3 }],
            });
            const before = await rawCharacter(idOf(player));

            const body = await equip(player, ghost.toHexString());

            expect(codeOf(body)).toBe('NOT_FOUND');
            expect(await rawCharacter(idOf(player))).toEqual(before);
        });

        it('never exceeds maxActiveSpells under concurrent equips', async () => {
            const dardo = await spellNamed('Dardo');
            const scudo = await spellNamed('Scudo');
            const player = await playerWith('twitch-eq-race-1', {
                xp: 20000,
                book: [
                    { spell: dardo, usages: 3 },
                    { spell: scudo, usages: 3 },
                ],
            });
            const [a, b] = [dardo.toHexString(), scudo.toHexString()];

            const bodies = await Promise.all(
                [a, b, a, b].map((spellId) => equip(player, spellId)),
            );

            const winners = bodies.filter((body) =>
                isSuccess(body, 'equipSpell'),
            );
            const losers = bodies.filter(
                (body) => !isSuccess(body, 'equipSpell'),
            );
            expect(winners).toHaveLength(1);
            expect(losers).toHaveLength(3);
            for (const loser of losers) {
                expect([
                    'MAX_ACTIVE_SPELLS_REACHED',
                    'SPELL_ALREADY_ACTIVE',
                ]).toContain(codeOf(loser));
            }
            expect(
                (await rawCharacter(idOf(player))).assets.activeSpells,
            ).toHaveLength(1);
        });

        it('never exceeds two slots under six concurrent equips', async () => {
            const ids = [
                await spellNamed('Dardo'),
                await spellNamed('Scudo'),
                await spellNamed('Lampo'),
            ];
            const player = await playerWith('twitch-eq-race-2', {
                xp: 25000,
                book: ids.map((spell) => ({ spell, usages: 3 })),
            });
            const hexes = ids.map((id) => id.toHexString());

            const bodies = await Promise.all(
                [...hexes, ...hexes].map((spellId) => equip(player, spellId)),
            );

            expect(
                bodies.filter((body) => isSuccess(body, 'equipSpell')),
            ).toHaveLength(2);
            const raw = await rawCharacter(idOf(player));
            expect(raw.assets.activeSpells).toHaveLength(2);
            expect(
                new Set(raw.assets.activeSpells.map((a) => String(a.spell)))
                    .size,
            ).toBe(2);
        });

        it('evaluates the capacity expression exactly like maxActiveSpellsFor across xp and titles', async () => {
            const xps = [
                0, 19999, 20000, 24999, 25000, 29999, 30000, 39999, 40000,
            ];
            const titles = Object.values(TitleType);
            const ids: Types.ObjectId[] = [];
            for (const xp of xps) {
                for (const title of titles) {
                    const created = await persistCharacter(characters, {
                        infos: {
                            ...buildCharacter().infos,
                            name: `Parity ${xp} ${title}`,
                        },
                        status: { ...buildCharacter().status, xp, title },
                    });
                    ids.push(created._id as Types.ObjectId);
                }
            }

            const rows = await characters.aggregate<{
                xp: number;
                title: TitleType;
                slots: number;
            }>([
                { $match: { _id: { $in: ids } } },
                {
                    $project: {
                        xp: '$status.xp',
                        title: '$status.title',
                        slots: maxActiveSpellsExpression(),
                    },
                },
            ]);

            expect(rows).toHaveLength(xps.length * titles.length);
            for (const row of rows) {
                expect(row.slots).toBe(maxActiveSpellsFor(row.xp, row.title));
            }
        });
    });

    describe('unequipSpell', () => {
        it('removes an active spell with a conditional pull', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-uneq-ok', {
                xp: 20000,
                book: [{ spell: dardo, usages: 2, active: true }],
            });

            const body = await unequip(player, dardo.toHexString());

            expect(body.data?.unequipSpell).toEqual({
                successful: true,
                response: 'Magia disequipaggiata con successo',
            });
            expect(
                (await rawCharacter(idOf(player))).assets.activeSpells,
            ).toEqual([]);
        });

        it('«Il timer di recupero non si interrompe mai»: unequipSpell leaves usages and recoveries of the spell untouched', async () => {
            const dardo = await spellNamed('Dardo', 3);
            const player = await playerWith('twitch-uneq-state', {
                xp: 20000,
                book: [
                    {
                        spell: dardo,
                        usages: 1,
                        recoveries: [minutesFromNow(2), minutesFromNow(30)],
                        active: true,
                    },
                ],
            });
            const before = await rawCharacter(idOf(player));

            const body = await unequip(player, dardo.toHexString());

            expect(isSuccess(body, 'unequipSpell')).toBe(true);
            const raw = await rawCharacter(idOf(player));
            expect(raw.assets.activeSpells).toEqual([]);
            expect(raw.status.spellStates).toEqual(before.status.spellStates);
        });

        it('unequip then equip never resets the usages (Phase 4 D-11 superseded)', async () => {
            const dardo = await spellNamed('Dardo', 3);
            const player = await playerWith('twitch-uneq-reequip', {
                xp: 20000,
                book: [
                    {
                        spell: dardo,
                        usages: 0,
                        recoveries: [
                            minutesFromNow(2),
                            minutesFromNow(10),
                            minutesFromNow(30),
                        ],
                        active: true,
                    },
                ],
            });
            const before = await rawCharacter(idOf(player));

            expect(
                isSuccess(
                    await unequip(player, dardo.toHexString()),
                    'unequipSpell',
                ),
            ).toBe(true);
            expect(
                isSuccess(
                    await equip(player, dardo.toHexString()),
                    'equipSpell',
                ),
            ).toBe(true);

            const raw = await rawCharacter(idOf(player));
            expect(raw.assets.activeSpells).toEqual([
                { spell: dardo, usages: 0 },
            ]);
            expect(raw.status.spellStates).toEqual(before.status.spellStates);
            expect(raw.status.spellStates[0].usages).toBe(0);
            expect(raw.status.spellStates[0].recoveries).toHaveLength(3);
        });

        it('removes an active spell stored with a legacy string id after the reference migration (D-17d)', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-uneq-legacy', {
                xp: 20000,
                book: [{ spell: dardo, usages: 2 }],
            });
            await storeLegacySpells(player, {
                'assets.activeSpells': [
                    { spell: dardo.toHexString(), usages: 2 },
                ],
            });
            await migrateLegacyRefs(harness.connection);

            const body = await unequip(player, dardo.toHexString());

            expect(isSuccess(body, 'unequipSpell')).toBe(true);
            expect(
                (await rawCharacter(idOf(player))).assets.activeSpells,
            ).toEqual([]);
        });

        it('answers SPELL_NOT_ACTIVE for an inactive spell and BAD_USER_INPUT for a malformed spell id (D-02)', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-uneq-inactive', {
                xp: 20000,
                book: [{ spell: dardo, usages: 3 }],
            });

            const body = await unequip(player, dardo.toHexString());
            const malformed = await unequip(player, 'abc');

            expect(codeOf(body)).toBe('SPELL_NOT_ACTIVE');
            expect(messageOf(body)).toBe('Magia non attiva');
            expect(codeOf(malformed)).toBe('BAD_USER_INPUT');
            expect(messageOf(malformed)).toBe('Input non valido: spellId');
        });

        it('unequips exactly once under concurrent calls', async () => {
            const dardo = await spellNamed('Dardo');
            const player = await playerWith('twitch-uneq-race', {
                xp: 20000,
                book: [{ spell: dardo, usages: 1, active: true }],
            });
            const a = dardo.toHexString();

            const bodies = await Promise.all([
                unequip(player, a),
                unequip(player, a),
                unequip(player, a),
            ]);

            const winners = bodies.filter((body) =>
                isSuccess(body, 'unequipSpell'),
            );
            const losers = bodies.filter(
                (body) => !isSuccess(body, 'unequipSpell'),
            );
            expect(winners).toHaveLength(1);
            expect(losers).toHaveLength(2);
            for (const loser of losers) {
                expect(codeOf(loser)).toBe('SPELL_NOT_ACTIVE');
            }
        });
    });
});
