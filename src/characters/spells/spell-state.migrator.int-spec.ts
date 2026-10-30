import { Logger } from '@nestjs/common';
import mongoose, { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Spell, SpellDocument, SpellSchema } from 'src/models/spell.model';
import {
    buildCharacter,
    persistSpell,
    spellBook,
} from '../../../test/fixtures';
import {
    isSpellStateOutOfRange,
    outOfRangeFilter,
} from './spell-state.migration';
import { SpellStateMigrator } from './spell-state.migrator';

const CharacterModel: Model<CharacterDocument> =
    mongoose.models.Character ||
    mongoose.model(Character.name, CharacterSchema);
const SpellModel: Model<SpellDocument> =
    mongoose.models.Spell || mongoose.model(Spell.name, SpellSchema);

const T = new Date('2026-10-27T10:00:00.000Z');
const hoursFrom = (hours: number) =>
    new Date(T.getTime() + hours * 60 * 60 * 1000);
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');

interface RawState {
    spell: Types.ObjectId;
    usages: number;
    recoveries: Date[];
}

interface RawCharacter {
    _id: Types.ObjectId;
    status: { spells: unknown[]; spellStates?: RawState[] };
    assets: { activeSpells?: { spell: unknown; usages: number }[] };
}

interface RawFixture {
    spells: unknown[];
    spellStates?: RawState[];
    assets?: Record<string, unknown>;
    deletedAt?: Date;
}

// nome unico: l'indice character_name_active_ci_unique vale anche per gli insert grezzi
let heroes = 0;

// documento grezzo: senza spellStates quando assente, come i personaggi scritti prima della fase (nessun default di Mongoose)
function rawCharacter({
    spells,
    spellStates,
    assets = { ...buildCharacter().assets },
    deletedAt,
}: RawFixture) {
    const base = buildCharacter();
    heroes += 1;
    const status: Record<string, unknown> = { ...base.status, spells };
    if (spellStates === undefined) delete status.spellStates;
    else status.spellStates = spellStates;
    return {
        _id: new Types.ObjectId(),
        ...base,
        infos: { ...base.infos, name: `Hero ${heroes}` },
        status,
        assets,
        ...(deletedAt ? { deletedAt } : {}),
    };
}

function coherentCharacter(book: ReturnType<typeof spellBook>) {
    return rawCharacter({
        spells: book.spells,
        spellStates: book.spellStates,
        assets: { ...buildCharacter().assets, activeSpells: book.activeSpells },
    });
}

async function insert(...docs: ReturnType<typeof rawCharacter>[]) {
    await CharacterModel.collection.insertMany(docs as never[]);
    return docs.map((doc) => doc._id);
}

async function rawOf(id: Types.ObjectId): Promise<RawCharacter> {
    const raw = await CharacterModel.collection.findOne({ _id: id });
    expect(raw).not.toBeNull();
    return raw as unknown as RawCharacter;
}

function snapshotAll() {
    return CharacterModel.collection.find().sort({ _id: 1 }).toArray();
}

describe('SpellStateMigrator (replSet)', () => {
    const migrator = new SpellStateMigrator(
        CharacterModel as never,
        SpellModel as never,
    );
    let a: Types.ObjectId;
    let b: Types.ObjectId;
    let orphan: Types.ObjectId;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(async () => {
        a = (await persistSpell(SpellModel, { maxUsages: 3 }))
            ._id as Types.ObjectId;
        b = (await persistSpell(SpellModel, { name: 'B', maxUsages: 2 }))
            ._id as Types.ObjectId;
        orphan = new Types.ObjectId();
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function warnings(): string[] {
        return warnSpy.mock.calls.map(([message]) => String(message));
    }

    function expectOnlyIdsWarned(characterId: Types.ObjectId) {
        const about = warnings().filter((message) =>
            message.includes(characterId.toHexString()),
        );
        expect(about.some((message) => message.includes(a.toHexString()))).toBe(
            true,
        );
        for (const message of about) {
            expect(message).not.toContain('Hero');
            expect(message).not.toContain('recoveries');
            expect(message).not.toContain(T.toISOString().slice(0, 10));
        }
    }

    describe('migrateAll', () => {
        it('migrates every active character on the first run and changes nothing on the second', async () => {
            const legacyString = rawCharacter({
                spells: [a.toHexString()],
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: a.toHexString(), usages: 1 }],
                },
            });
            const inactiveWithoutSlots = rawCharacter({
                spells: [b],
                assets: {},
            });
            const garbageAndOrphan = rawCharacter({
                spells: ['xyz', orphan],
            });
            const divergentMirror = rawCharacter({
                spells: [a],
                spellStates: [
                    { spell: a, usages: 2, recoveries: [hoursFrom(1)] },
                ],
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: a, usages: 3 }],
                },
            });
            const orphanState = rawCharacter({
                spells: [a],
                spellStates: [
                    { spell: a, usages: 1, recoveries: [hoursFrom(1)] },
                    { spell: b, usages: 2, recoveries: [] },
                ],
            });
            const empty = rawCharacter({ spells: [] });
            const coherent = coherentCharacter(
                spellBook([
                    {
                        spell: a,
                        usages: 1,
                        recoveries: [hoursFrom(1), hoursFrom(2)],
                        active: true,
                    },
                ]),
            );
            const archived = rawCharacter({
                spells: [a],
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: a, usages: 0 }],
                },
                deletedAt: ARCHIVED_AT,
            });
            await insert(
                legacyString,
                inactiveWithoutSlots,
                garbageAndOrphan,
                divergentMirror,
                orphanState,
                empty,
                coherent,
                archived,
            );
            const coherentBefore = await rawOf(coherent._id);
            const archivedBefore = await rawOf(archived._id);

            const firstRun = await migrator.migrateAll();

            expect(firstRun).toEqual({ migrated: 4, repaired: 2, trimmed: 0 });
            const legacyAfter = await rawOf(legacyString._id);
            expect(legacyAfter.status.spellStates).toEqual([
                { spell: a, usages: 1, recoveries: [] },
            ]);
            expect(legacyAfter.assets.activeSpells).toEqual([
                { spell: a.toHexString(), usages: 1 },
            ]);
            const inactiveAfter = await rawOf(inactiveWithoutSlots._id);
            expect(inactiveAfter.status.spellStates).toEqual([
                { spell: b, usages: 2, recoveries: [] },
            ]);
            expect(inactiveAfter.assets.activeSpells).toEqual([]);
            expect(
                (await rawOf(garbageAndOrphan._id)).status.spellStates,
            ).toEqual([{ spell: orphan, usages: 0, recoveries: [] }]);
            const divergentAfter = await rawOf(divergentMirror._id);
            expect(divergentAfter.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [hoursFrom(1)] },
            ]);
            expect(divergentAfter.assets.activeSpells).toEqual([
                { spell: a, usages: 2 },
            ]);
            expect((await rawOf(orphanState._id)).status.spellStates).toEqual([
                { spell: a, usages: 1, recoveries: [hoursFrom(1)] },
            ]);
            expect((await rawOf(empty._id)).status.spellStates).toEqual([]);
            expect(await rawOf(coherent._id)).toEqual(coherentBefore);
            expect(await rawOf(archived._id)).toEqual(archivedBefore);
            expect(archivedBefore.status.spellStates).toBeUndefined();

            const afterFirstRun = await snapshotAll();
            const secondRun = await migrator.migrateAll();

            expect(secondRun).toEqual({ migrated: 0, repaired: 0, trimmed: 0 });
            expect(await snapshotAll()).toEqual(afterFirstRun);
        });

        it('keeps the entries in the order of status.spells', async () => {
            const reversed = rawCharacter({
                spells: [a, b],
                spellStates: [
                    { spell: b, usages: 1, recoveries: [hoursFrom(1)] },
                    { spell: a, usages: 3, recoveries: [] },
                ],
            });
            await insert(reversed);

            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 1,
                trimmed: 0,
            });

            expect((await rawOf(reversed._id)).status.spellStates).toEqual([
                { spell: a, usages: 3, recoveries: [] },
                { spell: b, usages: 1, recoveries: [hoursFrom(1)] },
            ]);
        });

        it('reports a mirror slot of an unknown spell without counting it as repaired', async () => {
            const unknownSlot = rawCharacter({
                spells: [],
                spellStates: [],
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: a, usages: 2 }],
                },
            });
            await insert(unknownSlot);
            const before = await snapshotAll();

            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 0,
            });

            expect(await snapshotAll()).toEqual(before);
            expect(
                warnings().some((message) => message.includes('1 personaggi')),
            ).toBe(true);
        });

        it('drops every instant of a spell already at its maximum usages, leaving the usages alone', async () => {
            const full = coherentCharacter(
                spellBook([
                    { spell: a, usages: 3, recoveries: [hoursFrom(-1)] },
                ]),
            );
            await insert(full);

            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 1,
            });

            expect((await rawOf(full._id)).status.spellStates).toEqual([
                { spell: a, usages: 3, recoveries: [] },
            ]);
            expectOnlyIdsWarned(full._id);
            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 0,
            });
        });

        it('leaves the states of a catalog spell with an invalid maxUsages as stored, without warnings', async () => {
            const broken = new Types.ObjectId();
            await SpellModel.collection.insertOne({
                _id: broken,
                name: 'Broken',
                maxUsages: 'three',
            } as never);
            const holder = coherentCharacter(
                spellBook([
                    {
                        spell: broken,
                        usages: 5,
                        recoveries: [hoursFrom(1), hoursFrom(2)],
                    },
                ]),
            );
            await insert(holder);
            const before = await rawOf(holder._id);

            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 0,
            });

            expect(await rawOf(holder._id)).toEqual(before);
            expect(
                warnings().filter((message) =>
                    message.includes(holder._id.toHexString()),
                ),
            ).toEqual([]);
        });

        it('drops the oldest instants that no credit can consume, leaving the usages alone', async () => {
            const tooMany = coherentCharacter(
                spellBook([
                    {
                        spell: a,
                        usages: 1,
                        recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                    },
                ]),
            );
            await insert(tooMany);

            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 1,
            });

            expect((await rawOf(tooMany._id)).status.spellStates).toEqual([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(2), hoursFrom(3)],
                },
            ]);
            expectOnlyIdsWarned(tooMany._id);
            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 0,
            });
        });

        it('never lowers usages above the catalog maximum, only drops their instants', async () => {
            const over = coherentCharacter(
                spellBook([
                    { spell: a, usages: 5, recoveries: [hoursFrom(1)] },
                ]),
            );
            await insert(over);

            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 1,
            });

            expect((await rawOf(over._id)).status.spellStates).toEqual([
                { spell: a, usages: 5, recoveries: [] },
            ]);
            expectOnlyIdsWarned(over._id);
            expect(await migrator.migrateAll()).toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 0,
            });
        });
    });

    describe('malformed entries', () => {
        // voce scritta a mano: usi assenti e istanti non in lista; nessun credito può toccarla
        function corruptCharacter() {
            return rawCharacter({
                spells: [a, b],
                spellStates: [
                    { spell: a, recoveries: 'soon' },
                    { spell: b, usages: 2, recoveries: [hoursFrom(1)] },
                ] as unknown as RawState[],
            });
        }

        it('completes the batch around a corrupt entry, trimming every other document and leaving the corrupt entry as stored', async () => {
            const corrupt = corruptCharacter();
            const tooMany = coherentCharacter(
                spellBook([
                    {
                        spell: a,
                        usages: 1,
                        recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                    },
                ]),
            );
            await insert(corrupt, tooMany);

            await expect(migrator.migrateAll()).resolves.toEqual({
                migrated: 0,
                repaired: 0,
                trimmed: 2,
            });

            expect((await rawOf(corrupt._id)).status.spellStates).toEqual([
                { spell: a, recoveries: 'soon' },
                { spell: b, usages: 2, recoveries: [] },
            ]);
            expect((await rawOf(tooMany._id)).status.spellStates).toEqual([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(2), hoursFrom(3)],
                },
            ]);
            expect(errorSpy).not.toHaveBeenCalled();
        });

        it('migrates a single corrupt character without throwing', async () => {
            const corrupt = corruptCharacter();
            await insert(corrupt);

            await expect(migrator.migrateOne(corrupt._id)).resolves.toBe(true);
            await expect(migrator.migrateOne(corrupt._id)).resolves.toBe(false);

            expect((await rawOf(corrupt._id)).status.spellStates).toEqual([
                { spell: a, recoveries: 'soon' },
                { spell: b, usages: 2, recoveries: [] },
            ]);
        });

        it('agrees with its JavaScript mirror on a table of stored states', async () => {
            const instants = (count: number) =>
                Array.from({ length: count }, (_, hour) => hoursFrom(hour));
            const cases: [string, Record<string, unknown>, boolean][] = [
                [
                    'usages within range',
                    { usages: 1, recoveries: instants(2) },
                    false,
                ],
                [
                    'more instants than missing usages',
                    { usages: 1, recoveries: instants(3) },
                    true,
                ],
                [
                    'instants at the maximum',
                    { usages: 3, recoveries: instants(1) },
                    true,
                ],
                [
                    'usages over the maximum',
                    { usages: 5, recoveries: [] },
                    true,
                ],
                [
                    'usages over the maximum, instants not a list',
                    { usages: 5, recoveries: 'soon' },
                    true,
                ],
                ['full and idle', { usages: 3, recoveries: [] }, false],
                [
                    'null usages',
                    { usages: null, recoveries: instants(4) },
                    false,
                ],
                [
                    'string usages',
                    { usages: 'two', recoveries: instants(4) },
                    false,
                ],
                [
                    'missing usages, instants not a list',
                    { recoveries: 'soon' },
                    false,
                ],
                [
                    'fractional usages',
                    { usages: 1.5, recoveries: instants(2) },
                    false,
                ],
                [
                    'not-a-number usages',
                    { usages: NaN, recoveries: instants(4) },
                    false,
                ],
                [
                    'instants not a list',
                    { usages: 1, recoveries: 'soon' },
                    false,
                ],
                ['null instants', { usages: 1, recoveries: null }, false],
                ['missing instants', { usages: 1 }, false],
            ];
            const catalog = [{ id: a, maxUsages: 3 }];
            const docs = cases.map(([, state]) =>
                rawCharacter({
                    spells: [a],
                    spellStates: [
                        { spell: a, ...state },
                    ] as unknown as RawState[],
                }),
            );
            await insert(...docs);

            const flagged = new Set(
                (
                    await CharacterModel.collection
                        .find(outOfRangeFilter(catalog), {
                            projection: { _id: 1 },
                        })
                        .toArray()
                ).map(({ _id }) => String(_id)),
            );

            const outcomes = cases.map(([label, state], index) => [
                label,
                flagged.has(String(docs[index]._id)),
                isSpellStateOutOfRange(state, 3),
            ]);
            expect(outcomes).toEqual(
                cases.map(([label, , expected]) => [label, expected, expected]),
            );
        });
    });

    describe('migrateOne', () => {
        it('migrates a legacy character once and then is a no-op', async () => {
            const legacy = rawCharacter({
                spells: [a],
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: a, usages: 1 }],
                },
            });
            const untouched = rawCharacter({ spells: [b] });
            await insert(legacy, untouched);

            expect(await migrator.migrateOne(legacy._id)).toBe(true);

            expect((await rawOf(legacy._id)).status.spellStates).toEqual([
                { spell: a, usages: 1, recoveries: [] },
            ]);
            expect(
                (await rawOf(untouched._id)).status.spellStates,
            ).toBeUndefined();
            expect(await migrator.migrateOne(legacy._id)).toBe(false);
        });

        it('leaves an archived character alone', async () => {
            const archived = rawCharacter({
                spells: [a],
                deletedAt: ARCHIVED_AT,
            });
            await insert(archived);
            const before = await rawOf(archived._id);

            expect(await migrator.migrateOne(archived._id)).toBe(false);

            expect(await rawOf(archived._id)).toEqual(before);
        });

        it('drops the instants of a spell at its maximum usages', async () => {
            const full = coherentCharacter(
                spellBook([
                    { spell: a, usages: 3, recoveries: [hoursFrom(-1)] },
                ]),
            );
            await insert(full);

            expect(await migrator.migrateOne(full._id)).toBe(true);

            expect((await rawOf(full._id)).status.spellStates).toEqual([
                { spell: a, usages: 3, recoveries: [] },
            ]);
            expectOnlyIdsWarned(full._id);
            expect(await migrator.migrateOne(full._id)).toBe(false);
        });

        it('drops the oldest instants in excess of the missing usages', async () => {
            const tooMany = coherentCharacter(
                spellBook([
                    {
                        spell: a,
                        usages: 1,
                        recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                        active: true,
                    },
                ]),
            );
            await insert(tooMany);

            expect(await migrator.migrateOne(tooMany._id)).toBe(true);

            const after = await rawOf(tooMany._id);
            expect(after.status.spellStates).toEqual([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(2), hoursFrom(3)],
                },
            ]);
            expect(after.assets.activeSpells).toEqual([
                { spell: a, usages: 1 },
            ]);
            expectOnlyIdsWarned(tooMany._id);
            expect(await migrator.migrateOne(tooMany._id)).toBe(false);
        });
    });

    describe('onApplicationBootstrap', () => {
        it('migrates the characters at boot', async () => {
            const legacy = rawCharacter({ spells: [b] });
            await insert(legacy);

            await migrator.onApplicationBootstrap();

            expect((await rawOf(legacy._id)).status.spellStates).toEqual([
                { spell: b, usages: 2, recoveries: [] },
            ]);
        });

        it('never blocks the boot when the migration fails', async () => {
            const failure = Object.assign(new Error('boom'), { code: 91 });
            jest.spyOn(CharacterModel, 'updateMany').mockReturnValueOnce({
                exec: () => Promise.reject(failure),
            } as never);

            await expect(migrator.onApplicationBootstrap()).resolves.toBe(
                undefined,
            );

            const errors = errorSpy.mock.calls.map(([message]) =>
                String(message),
            );
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain('Error, code 91');
            expect(errors[0]).not.toContain('boom');
        });
    });
});
