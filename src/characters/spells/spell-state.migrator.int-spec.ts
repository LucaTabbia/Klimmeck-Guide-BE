import { Logger } from '@nestjs/common';
import mongoose, { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Spell, SpellDocument, SpellSchema } from 'src/models/spell.model';
import { buildCharacter, persistSpell } from '../../../test/fixtures';
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
    active?: boolean;
}

interface RawCharacter {
    _id: Types.ObjectId;
    status: { spellStates?: RawState[] };
}

// nome unico: l'indice character_name_active_ci_unique vale anche per gli insert grezzi
let heroes = 0;

// documento grezzo nella forma della revisione dei modelli (Phase 19 D-07): la sola lista delle voci
function rawCharacter(spellStates: RawState[], deletedAt?: Date) {
    const base = buildCharacter();
    heroes += 1;
    const status: Record<string, unknown> = { ...base.status, spellStates };
    return {
        _id: new Types.ObjectId(),
        ...base,
        infos: { ...base.infos, name: `Hero ${heroes}` },
        status,
        ...(deletedAt ? { deletedAt } : {}),
    };
}

// voci scritte prima della revisione: senza il flag oppure del tutto assenti
function preReviewCharacter(spellStates?: RawState[]) {
    const doc = rawCharacter(spellStates ?? []);
    if (spellStates === undefined) delete doc.status.spellStates;
    return doc;
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
        it('trims the instants of an active spell state and keeps it active (D-21)', async () => {
            const tooMany = rawCharacter([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                    active: true,
                },
                { spell: b, usages: 2, recoveries: [], active: false },
            ]);
            await insert(tooMany);

            await migrator.migrateAll();

            expect((await rawOf(tooMany._id)).status.spellStates).toEqual([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(2), hoursFrom(3)],
                    active: true,
                },
                { spell: b, usages: 2, recoveries: [], active: false },
            ]);
            expectOnlyIdsWarned(tooMany._id);
        });

        it('never rebuilds the spell states of a character without the old lists (D-21)', async () => {
            const settled = rawCharacter([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(1), hoursFrom(2)],
                    active: true,
                },
                { spell: b, usages: 2, recoveries: [], active: false },
                { spell: orphan, usages: 0, recoveries: [], active: false },
            ]);
            const withoutSpells = rawCharacter([]);
            await insert(settled, withoutSpells);
            const before = await snapshotAll();

            await migrator.migrateAll();
            expect(await snapshotAll()).toEqual(before);

            expect(await migrator.migrateOne(settled._id)).toBe(false);
            expect(await migrator.migrateOne(withoutSpells._id)).toBe(false);
            expect(await snapshotAll()).toEqual(before);
            expect(warnings()).toEqual([]);
        });

        it('reports only the trimmed characters (D-21)', async () => {
            const full = rawCharacter([
                {
                    spell: a,
                    usages: 3,
                    recoveries: [hoursFrom(-1)],
                    active: true,
                },
            ]);
            const settled = rawCharacter([
                { spell: b, usages: 2, recoveries: [], active: false },
            ]);
            await insert(full, settled);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 1 });
            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });
        });

        it('leaves a character written before the review as stored, in whatever state', async () => {
            const neverMigrated = preReviewCharacter();
            const reversed = preReviewCharacter([
                { spell: b, usages: 1, recoveries: [hoursFrom(1)] },
                { spell: a, usages: 3, recoveries: [] },
            ]);
            const orphanState = preReviewCharacter([
                { spell: a, usages: 1, recoveries: [hoursFrom(1)] },
                { spell: orphan, usages: 2, recoveries: [] },
            ]);
            await insert(neverMigrated, reversed, orphanState);
            const before = await snapshotAll();

            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });
            expect(await migrator.migrateOne(neverMigrated._id)).toBe(false);

            expect(await snapshotAll()).toEqual(before);
            expect(
                (await rawOf(neverMigrated._id)).status.spellStates,
            ).toBeUndefined();
            expect(warnings()).toEqual([]);
        });

        it('trims a state stored without the flag and adds no flag to it', async () => {
            const preReview = preReviewCharacter([
                { spell: a, usages: 3, recoveries: [hoursFrom(-1)] },
            ]);
            await insert(preReview);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 1 });

            const after = await rawOf(preReview._id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 3, recoveries: [] },
            ]);
        });

        it('leaves an archived character alone', async () => {
            const archived = rawCharacter(
                [
                    {
                        spell: a,
                        usages: 3,
                        recoveries: [hoursFrom(-1)],
                        active: true,
                    },
                ],
                ARCHIVED_AT,
            );
            await insert(archived);
            const before = await rawOf(archived._id);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });

            expect(await rawOf(archived._id)).toEqual(before);
        });

        it('drops every instant of a spell already at its maximum usages, leaving the usages alone', async () => {
            const full = rawCharacter([
                {
                    spell: a,
                    usages: 3,
                    recoveries: [hoursFrom(-1)],
                    active: false,
                },
            ]);
            await insert(full);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 1 });

            expect((await rawOf(full._id)).status.spellStates).toEqual([
                { spell: a, usages: 3, recoveries: [], active: false },
            ]);
            expectOnlyIdsWarned(full._id);
            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });
        });

        it('leaves the states of a catalog spell with an invalid maxUsages as stored, without warnings', async () => {
            const broken = new Types.ObjectId();
            await SpellModel.collection.insertOne({
                _id: broken,
                name: 'Broken',
                maxUsages: 'three',
            } as never);
            const holder = rawCharacter([
                {
                    spell: broken,
                    usages: 5,
                    recoveries: [hoursFrom(1), hoursFrom(2)],
                    active: true,
                },
            ]);
            await insert(holder);
            const before = await rawOf(holder._id);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });

            expect(await rawOf(holder._id)).toEqual(before);
            expect(
                warnings().filter((message) =>
                    message.includes(holder._id.toHexString()),
                ),
            ).toEqual([]);
        });

        it('drops the oldest instants that no credit can consume, leaving the usages alone', async () => {
            const tooMany = rawCharacter([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                    active: false,
                },
            ]);
            await insert(tooMany);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 1 });

            expect((await rawOf(tooMany._id)).status.spellStates).toEqual([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(2), hoursFrom(3)],
                    active: false,
                },
            ]);
            expectOnlyIdsWarned(tooMany._id);
            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });
        });

        it('never lowers usages above the catalog maximum, only drops their instants', async () => {
            const over = rawCharacter([
                {
                    spell: a,
                    usages: 5,
                    recoveries: [hoursFrom(1)],
                    active: true,
                },
            ]);
            await insert(over);

            expect(await migrator.migrateAll()).toEqual({ trimmed: 1 });

            expect((await rawOf(over._id)).status.spellStates).toEqual([
                { spell: a, usages: 5, recoveries: [], active: true },
            ]);
            expectOnlyIdsWarned(over._id);
            expect(await migrator.migrateAll()).toEqual({ trimmed: 0 });
        });
    });

    describe('malformed entries', () => {
        // voce scritta a mano: usi assenti e istanti non in lista; nessun credito può toccarla
        function corruptCharacter() {
            return rawCharacter([
                { spell: a, recoveries: 'soon' },
                { spell: b, usages: 2, recoveries: [hoursFrom(1)] },
            ] as unknown as RawState[]);
        }

        it('completes the batch around a corrupt entry, trimming every other document and leaving the corrupt entry as stored', async () => {
            const corrupt = corruptCharacter();
            const tooMany = rawCharacter([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                    active: false,
                },
            ]);
            await insert(corrupt, tooMany);

            await expect(migrator.migrateAll()).resolves.toEqual({
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
                    active: false,
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
                rawCharacter([{ spell: a, ...state }] as unknown as RawState[]),
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
        it('trims one character and leaves every other one alone', async () => {
            const full = () =>
                rawCharacter([
                    {
                        spell: a,
                        usages: 3,
                        recoveries: [hoursFrom(-1)],
                        active: true,
                    },
                ]);
            const target = full();
            const untouched = full();
            await insert(target, untouched);
            const untouchedBefore = await rawOf(untouched._id);

            expect(await migrator.migrateOne(target._id)).toBe(true);

            expect((await rawOf(target._id)).status.spellStates).toEqual([
                { spell: a, usages: 3, recoveries: [], active: true },
            ]);
            expect(await rawOf(untouched._id)).toEqual(untouchedBefore);
            expectOnlyIdsWarned(target._id);
            expect(await migrator.migrateOne(target._id)).toBe(false);
        });

        it('leaves an archived character alone', async () => {
            const archived = rawCharacter(
                [
                    {
                        spell: a,
                        usages: 3,
                        recoveries: [hoursFrom(-1)],
                        active: true,
                    },
                ],
                ARCHIVED_AT,
            );
            await insert(archived);
            const before = await rawOf(archived._id);

            expect(await migrator.migrateOne(archived._id)).toBe(false);

            expect(await rawOf(archived._id)).toEqual(before);
        });

        it('drops the oldest instants in excess of the missing usages', async () => {
            const tooMany = rawCharacter([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(1), hoursFrom(2), hoursFrom(3)],
                    active: true,
                },
            ]);
            await insert(tooMany);

            expect(await migrator.migrateOne(tooMany._id)).toBe(true);

            expect((await rawOf(tooMany._id)).status.spellStates).toEqual([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [hoursFrom(2), hoursFrom(3)],
                    active: true,
                },
            ]);
            expectOnlyIdsWarned(tooMany._id);
            expect(await migrator.migrateOne(tooMany._id)).toBe(false);
        });
    });

    describe('onApplicationBootstrap', () => {
        it('trims the characters at boot', async () => {
            const full = rawCharacter([
                {
                    spell: b,
                    usages: 2,
                    recoveries: [hoursFrom(1)],
                    active: true,
                },
            ]);
            await insert(full);

            await migrator.onApplicationBootstrap();

            expect((await rawOf(full._id)).status.spellStates).toEqual([
                { spell: b, usages: 2, recoveries: [], active: true },
            ]);
        });

        it('never blocks the boot when the trim fails', async () => {
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
