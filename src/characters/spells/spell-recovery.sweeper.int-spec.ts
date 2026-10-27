import { Logger } from '@nestjs/common';
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
import { SpellRecoveryService } from './spell-recovery.service';
import { SpellRecoverySweeper } from './spell-recovery.sweeper';
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
    status: {
        spellStates: {
            spell: Types.ObjectId;
            usages: number;
            recoveries: Date[];
        }[];
    };
    assets: { activeSpells: { spell: unknown; usages: number }[] };
}

let heroes = 0;

// nome unico: l'indice character_name_active_ci_unique vale anche per gli insert grezzi
async function insertBook(
    entries: readonly SpellBookEntry[],
    extra: Record<string, unknown> = {},
): Promise<Types.ObjectId> {
    const base = buildCharacter();
    const book = spellBook(entries);
    heroes += 1;
    const _id = new Types.ObjectId();
    await CharacterModel.collection.insertOne({
        ...base,
        _id,
        infos: { ...base.infos, name: `Hero ${heroes}` },
        status: {
            ...base.status,
            spells: book.spells,
            spellStates: book.spellStates,
        },
        assets: { ...base.assets, activeSpells: book.activeSpells },
        ...extra,
    } as never);
    return _id;
}

async function rawOf(id: Types.ObjectId): Promise<RawCharacter> {
    const raw = await CharacterModel.collection.findOne({ _id: id });
    expect(raw).not.toBeNull();
    return raw as unknown as RawCharacter;
}

describe('SpellRecoverySweeper (replSet)', () => {
    const clock = new FixedClock(T);
    const migrator = new SpellStateMigrator(
        CharacterModel as never,
        SpellModel as never,
    );
    const service = new SpellRecoveryService(
        CharacterModel as never,
        SpellModel as never,
        migrator,
        clock,
    );
    let sweeper: SpellRecoverySweeper;
    let spell: Types.ObjectId;
    let warnSpy: jest.SpyInstance;

    beforeEach(async () => {
        sweeper = new SpellRecoverySweeper(
            { sweepIntervalMs: 0 },
            CharacterModel as never,
            service,
            clock,
        );
        spell = (
            await persistSpell(SpellModel, {
                maxUsages: 3,
                recoveryTime: MINUTE,
            })
        )._id as Types.ObjectId;
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        await sweeper.onModuleDestroy();
        jest.restoreAllMocks();
    });

    it('«Il timer di recupero non si interrompe mai»: the sweep gives back every due instant within one pass, equipped or not', async () => {
        const equipped = await insertBook([
            {
                spell,
                usages: 0,
                recoveries: [at(-2 * MINUTE), at(-MINUTE), at(HOUR)],
                active: true,
            },
        ]);
        const unequipped = await insertBook([
            { spell, usages: 2, recoveries: [at(-SECOND)] },
        ]);

        expect(await sweeper.sweep()).toBe(3);

        const a = await rawOf(equipped);
        expect(a.status.spellStates).toEqual([
            { spell, usages: 2, recoveries: [at(HOUR)] },
        ]);
        expect(a.assets.activeSpells).toEqual([{ spell, usages: 2 }]);
        const b = await rawOf(unequipped);
        expect(b.status.spellStates).toEqual([
            { spell, usages: 3, recoveries: [] },
        ]);
        expect(b.assets.activeSpells).toEqual([]);
    });

    it('leaves an archived character alone', async () => {
        const archived = await insertBook(
            [{ spell, usages: 1, recoveries: [at(-SECOND)], active: true }],
            { deletedAt: ARCHIVED_AT },
        );
        const before = await rawOf(archived);

        expect(await sweeper.sweep()).toBe(0);

        expect(await rawOf(archived)).toEqual(before);
    });

    it('writes nothing while every instant is still ahead', async () => {
        const waiting = await insertBook([
            { spell, usages: 1, recoveries: [at(SECOND), at(HOUR)] },
        ]);
        const before = await rawOf(waiting);

        expect(await sweeper.sweep()).toBe(0);

        expect(await rawOf(waiting)).toEqual(before);
    });

    it('never credits an instant twice when the sweep races a trigger on the same entry', async () => {
        const racing = await insertBook([
            {
                spell,
                usages: 1,
                recoveries: [at(-2 * MINUTE), at(-MINUTE)],
                active: true,
            },
        ]);

        const [swept, triggered] = await Promise.all([
            sweeper.sweep(),
            service.recoverDue(racing, spell),
        ]);

        expect(swept + triggered).toBe(2);
        const after = await rawOf(racing);
        expect(after.status.spellStates).toEqual([
            { spell, usages: 3, recoveries: [] },
        ]);
        expect(after.assets.activeSpells).toEqual([{ spell, usages: 3 }]);
    });

    it('warns once about a spell missing from the catalog and stops asking for its credit, leaving the entry in place', async () => {
        const orphan = new Types.ObjectId();
        const id = await insertBook([
            { spell: orphan, usages: 0, recoveries: [at(-SECOND)] },
            { spell, usages: 1, recoveries: [at(-SECOND), at(HOUR)] },
        ]);
        const recoverDue = jest.spyOn(service, 'recoverDue');
        const warnsAboutOrphan = () =>
            warnSpy.mock.calls.filter(([message]) =>
                String(message).includes(orphan.toHexString()),
            );

        expect(await sweeper.sweep()).toBe(1);
        expect(await sweeper.sweep()).toBe(0);

        expect(warnsAboutOrphan()).toHaveLength(1);
        expect(
            recoverDue.mock.calls.filter(([, spellId]) =>
                spellId.equals(orphan),
            ),
        ).toHaveLength(1);
        expect((await rawOf(id)).status.spellStates).toEqual([
            { spell: orphan, usages: 0, recoveries: [at(-SECOND)] },
            { spell, usages: 2, recoveries: [at(HOUR)] },
        ]);
    });
});
