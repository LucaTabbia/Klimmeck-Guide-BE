import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import mongoose, { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Spell, SpellDocument, SpellSchema } from 'src/models/spell.model';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    buildCharacter,
    persistSpell,
    spellBook,
    SpellBookEntry,
} from '../../../test/fixtures';
import { SpellRecoveryJobData, spellRecoveryJobId } from './spell-recovery-job';
import { SpellRecoveryProcessor } from './spell-recovery.processor';
import { SpellRecoveryService } from './spell-recovery.service';
import { Sleeper } from './sleeper';
import { SpellStateMigrator } from './spell-state.migrator';

const CharacterModel: Model<CharacterDocument> =
    mongoose.models.Character ||
    mongoose.model(Character.name, CharacterSchema);
const SpellModel: Model<SpellDocument> =
    mongoose.models.Spell || mongoose.model(Spell.name, SpellSchema);

const T = new Date('2026-10-27T10:00:00.000Z');
const at = (milliseconds: number) => new Date(T.getTime() + milliseconds);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const ARCHIVED_AT = new Date('2026-01-01T00:00:00.000Z');

interface RawCharacter {
    _id: Types.ObjectId;
    status: {
        spellStates?: {
            spell: Types.ObjectId;
            usages: number;
            recoveries: Date[];
        }[];
    };
    assets: { activeSpells?: { spell: unknown; usages: number }[] };
}

let heroes = 0;

// nome unico: l'indice character_name_active_ci_unique vale anche per gli insert grezzi
function rawCharacter(
    status: Record<string, unknown>,
    assets: Record<string, unknown>,
    extra: Record<string, unknown> = {},
) {
    const base = buildCharacter();
    heroes += 1;
    return {
        ...base,
        _id: new Types.ObjectId(),
        infos: { ...base.infos, name: `Hero ${heroes}` },
        status: { ...base.status, ...status },
        assets,
        ...extra,
    };
}

async function insert(doc: ReturnType<typeof rawCharacter>) {
    await CharacterModel.collection.insertOne(doc as never);
    return doc._id;
}

function insertBook(
    entries: readonly SpellBookEntry[],
    extra: Record<string, unknown> = {},
) {
    const book = spellBook(entries);
    return insert(
        rawCharacter(
            { spells: book.spells, spellStates: book.spellStates },
            { ...buildCharacter().assets, activeSpells: book.activeSpells },
            extra,
        ),
    );
}

async function rawOf(id: Types.ObjectId): Promise<RawCharacter> {
    const raw = await CharacterModel.collection.findOne({ _id: id });
    expect(raw).not.toBeNull();
    return raw as unknown as RawCharacter;
}

describe('SpellRecoveryService (replSet)', () => {
    const migrator = new SpellStateMigrator(
        CharacterModel as never,
        SpellModel as never,
    );
    let service: SpellRecoveryService;
    let a: Types.ObjectId;
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        service = new SpellRecoveryService(
            CharacterModel as never,
            SpellModel as never,
            migrator,
            new FixedClock(T),
        );
        a = (
            await persistSpell(SpellModel, {
                maxUsages: 3,
                recoveryTime: MINUTE,
            })
        )._id as Types.ObjectId;
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function warnedAbout(...fragments: string[]): boolean {
        return warnSpy.mock.calls
            .map(([message]) => String(message))
            .some((message) =>
                fragments.every((fragment) => message.includes(fragment)),
            );
    }

    describe('recoverDue', () => {
        it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata. Il timer di recupero non si interrompe mai»: an unequipped spell recovers a usage when its instant is due', async () => {
            const id = await insertBook([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [at(-SECOND), at(10 * MINUTE)],
                },
            ]);

            expect(await service.recoverDue(id, a)).toBe(1);

            const after = await rawOf(id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [at(10 * MINUTE)] },
            ]);
            expect(after.assets.activeSpells).toEqual([]);
        });

        it('credits the state and the slot mirror in the same update', async () => {
            const id = await insertBook([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [at(-SECOND)],
                    active: true,
                },
            ]);

            expect(await service.recoverDue(id, a)).toBe(1);

            const after = await rawOf(id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [] },
            ]);
            expect(after.assets.activeSpells).toEqual([
                { spell: a, usages: 2 },
            ]);
        });

        it('gives back one usage for each due instant, duplicates included', async () => {
            const id = await insertBook([
                {
                    spell: a,
                    usages: 0,
                    recoveries: [at(-SECOND), at(-SECOND), at(HOUR)],
                },
            ]);

            expect(await service.recoverDue(id, a)).toBe(2);

            expect((await rawOf(id)).status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [at(HOUR)] },
            ]);
        });

        it('never credits more than the due instants under concurrent calls', async () => {
            const id = await insertBook([
                {
                    spell: a,
                    usages: 0,
                    recoveries: [at(-SECOND), at(-SECOND), at(HOUR)],
                    active: true,
                },
            ]);

            const credits = await Promise.all(
                Array.from({ length: 6 }, () => service.recoverDue(id, a)),
            );

            expect(credits.reduce((sum, credit) => sum + credit, 0)).toBe(2);
            const after = await rawOf(id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [at(HOUR)] },
            ]);
            expect(after.assets.activeSpells).toEqual([
                { spell: a, usages: 2 },
            ]);
        });

        it('credits nothing when the same recovery is replayed', async () => {
            const id = await insertBook([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [at(-SECOND)],
                    active: true,
                },
            ]);
            await service.recoverDue(id, a);
            const before = await rawOf(id);

            expect(await service.recoverDue(id, a)).toBe(0);

            expect(await rawOf(id)).toEqual(before);
        });

        it('never goes beyond maxUsages, even with a due instant left over', async () => {
            const id = await insertBook([
                {
                    spell: a,
                    usages: 3,
                    recoveries: [at(-SECOND)],
                    active: true,
                },
            ]);

            expect(await service.recoverDue(id, a)).toBe(0);

            const after = await rawOf(id);
            expect(after.status.spellStates?.[0].usages).toBe(3);
            expect(after.assets.activeSpells).toEqual([
                { spell: a, usages: 3 },
            ]);
        });

        it('credits nothing to an archived character', async () => {
            const id = await insertBook(
                [{ spell: a, usages: 1, recoveries: [at(-SECOND)] }],
                { deletedAt: ARCHIVED_AT },
            );
            const before = await rawOf(id);

            expect(await service.recoverDue(id, a)).toBe(0);

            expect(await rawOf(id)).toEqual(before);
        });

        it('credits nothing for a spell the character does not know', async () => {
            const id = await insertBook([]);

            expect(await service.recoverDue(id, a)).toBe(0);

            expect((await rawOf(id)).status.spellStates).toEqual([]);
        });

        it('credits nothing and warns with the ids when the spell is missing from the catalog', async () => {
            const missing = new Types.ObjectId();
            const id = await insertBook([
                { spell: missing, usages: 0, recoveries: [at(-SECOND)] },
            ]);
            const before = await rawOf(id);

            expect(await service.recoverDue(id, missing)).toBe(0);

            expect(await rawOf(id)).toEqual(before);
            expect(warnedAbout(missing.toHexString(), id.toHexString())).toBe(
                true,
            );
        });

        it('warns once per character and spell, telling an invalid maxUsages apart from a missing spell', async () => {
            const invalid = new Types.ObjectId();
            await SpellModel.collection.insertOne({
                _id: invalid,
                name: 'Broken',
                maxUsages: 'three',
            } as never);
            const missing = new Types.ObjectId();
            const id = await insertBook([
                { spell: invalid, usages: 0, recoveries: [at(-SECOND)] },
                { spell: missing, usages: 0, recoveries: [at(-SECOND)] },
            ]);

            for (let replay = 0; replay < 3; replay++) {
                expect(await service.recoverDue(id, invalid)).toBe(0);
                expect(await service.recoverDue(id, missing)).toBe(0);
            }

            expect(warnSpy.mock.calls.map(([value]) => String(value))).toEqual([
                `Magia ${invalid.toHexString()} con maxUsages non valido nel catalogo: nessun recupero per il personaggio ${id.toHexString()}`,
                `Magia ${missing.toHexString()} assente dal catalogo: nessun recupero per il personaggio ${id.toHexString()}`,
            ]);
            expect(service.isKnownUncreditable(id, invalid)).toBe(true);
            expect(service.isKnownUncreditable(id, missing)).toBe(true);
            expect(service.isKnownUncreditable(id, a)).toBe(false);
        });

        it('forgets the oldest uncreditable pair beyond the memory limit and warns about it again', async () => {
            const memoryLimit = 1_000;
            const missing = new Types.ObjectId();
            const characters = Array.from(
                { length: memoryLimit + 1 },
                () => new Types.ObjectId(),
            );
            for (const characterId of characters) {
                expect(await service.recoverDue(characterId, missing)).toBe(0);
            }
            const [oldest, second] = characters;

            expect(service.isKnownUncreditable(oldest, missing)).toBe(false);
            expect(service.isKnownUncreditable(second, missing)).toBe(true);
            expect(warnSpy).toHaveBeenCalledTimes(memoryLimit + 1);

            expect(await service.recoverDue(oldest, missing)).toBe(0);

            expect(warnSpy).toHaveBeenCalledTimes(memoryLimit + 2);
            expect(service.isKnownUncreditable(oldest, missing)).toBe(true);
            expect(service.isKnownUncreditable(second, missing)).toBe(false);
        });

        it('credits nothing and lets the error through when the per-character migration fails', async () => {
            const id = await insertBook([
                { spell: a, usages: 1, recoveries: [at(-SECOND)] },
            ]);
            const before = await rawOf(id);
            const failure = Object.assign(new Error('boom'), { code: 91 });
            jest.spyOn(migrator, 'migrateOne').mockRejectedValueOnce(failure);

            await expect(service.recoverDue(id, a)).rejects.toBe(failure);

            expect(await rawOf(id)).toEqual(before);
        });

        it('credits a character whose slots array was never written', async () => {
            const book = spellBook([
                { spell: a, usages: 1, recoveries: [at(-SECOND)] },
            ]);
            const id = await insert(
                rawCharacter(
                    { spells: book.spells, spellStates: book.spellStates },
                    {},
                ),
            );

            expect(await service.recoverDue(id, a)).toBe(1);

            const after = await rawOf(id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [] },
            ]);
            expect(after.assets.activeSpells).toEqual([]);
        });
    });

    describe('recoverLegacy', () => {
        it('migrates a character without spell states before the credit', async () => {
            const legacy = rawCharacter(
                { spells: [a] },
                {
                    ...buildCharacter().assets,
                    activeSpells: [{ spell: a, usages: 1 }],
                },
            );
            delete (legacy.status as Record<string, unknown>).spellStates;
            const id = await insert(legacy);

            expect(await service.recoverLegacy(id, a)).toBe(true);

            const after = await rawOf(id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [] },
            ]);
            expect(after.assets.activeSpells).toEqual([
                { spell: a, usages: 2 },
            ]);
        });

        it('gives back only the untracked deficit and leaves the instants alone', async () => {
            const id = await insertBook([
                { spell: a, usages: 1, recoveries: [at(HOUR)], active: true },
            ]);

            expect(await service.recoverLegacy(id, a)).toBe(true);

            const after = await rawOf(id);
            expect(after.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [at(HOUR)] },
            ]);
            expect(after.assets.activeSpells).toEqual([
                { spell: a, usages: 2 },
            ]);
            expect(await service.recoverLegacy(id, a)).toBe(false);
        });

        it('credits the untracked deficit exactly once under concurrent calls', async () => {
            const id = await insertBook([
                { spell: a, usages: 1, recoveries: [at(HOUR)] },
            ]);

            const credits = await Promise.all(
                Array.from({ length: 4 }, () => service.recoverLegacy(id, a)),
            );

            expect(credits.filter(Boolean)).toHaveLength(1);
            expect((await rawOf(id)).status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [at(HOUR)] },
            ]);
        });

        it('credits nothing and warns when the legacy job names a spell missing from the catalog', async () => {
            const missing = new Types.ObjectId();
            const id = await insertBook([
                { spell: missing, usages: 0, recoveries: [] },
            ]);
            const before = await rawOf(id);

            expect(await service.recoverLegacy(id, missing)).toBe(false);

            expect(await rawOf(id)).toEqual(before);
            expect(warnedAbout(missing.toHexString(), id.toHexString())).toBe(
                true,
            );
            expect(service.isKnownUncreditable(id, missing)).toBe(true);
        });

        it('credits nothing to an archived character', async () => {
            const id = await insertBook(
                [{ spell: a, usages: 1, recoveries: [] }],
                { deletedAt: ARCHIVED_AT },
            );

            expect(await service.recoverLegacy(id, a)).toBe(false);
        });
    });

    describe('processor job early within the clock tolerance', () => {
        // l'attesa finta fa avanzare lo stesso orologio del credito
        function processorOn(clock: FixedClock): SpellRecoveryProcessor {
            const sleeper = {
                sleep: (ms: number) => {
                    clock.advanceSeconds(ms / SECOND);
                    return Promise.resolve();
                },
            } as Sleeper;
            return new SpellRecoveryProcessor(
                new SpellRecoveryService(
                    CharacterModel as never,
                    SpellModel as never,
                    migrator,
                    clock,
                ),
                clock,
                sleeper,
            );
        }

        it('«Il timer di recupero non si interrompe mai»: waits for the instant, credits it once and stays idempotent under replay', async () => {
            const dueAt = at(2 * SECOND);
            const id = await insertBook([
                {
                    spell: a,
                    usages: 1,
                    recoveries: [dueAt, at(HOUR)],
                    active: true,
                },
            ]);
            const job = {
                id: spellRecoveryJobId(id, a, dueAt),
                data: {
                    characterId: id.toHexString(),
                    spellId: a.toHexString(),
                    dueAt: dueAt.getTime(),
                },
            } as Job<SpellRecoveryJobData>;
            const processor = processorOn(new FixedClock(T));

            await processor.recover(job);
            const credited = await rawOf(id);
            await processor.recover(job);

            expect(credited.status.spellStates).toEqual([
                { spell: a, usages: 2, recoveries: [at(HOUR)] },
            ]);
            expect(credited.assets.activeSpells).toEqual([
                { spell: a, usages: 2 },
            ]);
            expect(await rawOf(id)).toEqual(credited);
        });
    });
});
