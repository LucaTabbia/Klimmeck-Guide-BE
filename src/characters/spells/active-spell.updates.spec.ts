import { Types } from 'mongoose';
import { maxActiveSpellsExpression } from 'src/models/character/active-spell-slots';
import { TitleType } from 'src/models/enums/title-type.enum';
import * as activeSpellUpdates from './active-spell.updates';
import {
    ACTIVE_SPELL_SNAPSHOT_PROJECTION,
    ActiveSpellSnapshot,
    classifyEquipSpellFailure,
    classifyUnequipSpellFailure,
    classifyUseSpellFailure,
    equipSpellFilter,
    equipSpellUpdate,
    unequipSpellFilter,
    unequipSpellUpdate,
} from './active-spell.updates';
import { SpellStateEntry } from './spell-state.snapshot';
import { spellStateArrayFilters } from './spell-state.updates';

describe('active spell write builders', () => {
    const c = new Types.ObjectId();
    const s = new Types.ObjectId();

    it('equips only a known spell that is not active yet, below the live capacity (D-07)', () => {
        const filter = equipSpellFilter(c, s);

        expect(filter).toEqual({
            _id: c,
            deletedAt: null,
            'status.spellStates': {
                $elemMatch: { spell: s, active: { $ne: true } },
            },
            $expr: {
                $lt: [
                    {
                        $size: {
                            $filter: {
                                input: { $ifNull: ['$status.spellStates', []] },
                                cond: { $eq: ['$$this.active', true] },
                            },
                        },
                    },
                    maxActiveSpellsExpression(),
                ],
            },
        });
        expect(filter._id).toBeInstanceOf(Types.ObjectId);
        expect(filter['status.spellStates'].$elemMatch.spell).toBeInstanceOf(
            Types.ObjectId,
        );
    });

    it('sets the active flag of the spell state and writes nothing else (D-07)', () => {
        expect(equipSpellUpdate()).toEqual({
            $set: { 'status.spellStates.$[s].active': true },
        });
        expect(spellStateArrayFilters(s)).toEqual({
            arrayFilters: [{ 's.spell': s }],
        });
    });

    it('unequips only an active spell state (D-07)', () => {
        expect(unequipSpellFilter(c, s)).toEqual({
            _id: c,
            deletedAt: null,
            'status.spellStates': { $elemMatch: { spell: s, active: true } },
        });
        expect(unequipSpellUpdate()).toEqual({
            $set: { 'status.spellStates.$[s].active': false },
        });
    });

    it('exposes only the slot builders and classifiers: usages are spent and credited on the spell state', () => {
        expect(Object.keys(activeSpellUpdates).sort()).toEqual([
            'ACTIVE_SPELL_SNAPSHOT_PROJECTION',
            'classifyEquipSpellFailure',
            'classifyUnequipSpellFailure',
            'classifyUseSpellFailure',
            'equipSpellFilter',
            'equipSpellUpdate',
            'unequipSpellFilter',
            'unequipSpellUpdate',
        ]);
    });
});

describe('active spell failure classifiers', () => {
    const s = new Types.ObjectId();
    const other = new Types.ObjectId();
    const entry = (
        spell: unknown,
        active?: boolean,
        usages: number | undefined = 3,
    ): SpellStateEntry => ({ spell, usages, recoveries: [], active });
    const snapshot = (
        spellStates: SpellStateEntry[],
        xp?: number,
        title?: TitleType,
    ): ActiveSpellSnapshot => ({ status: { spellStates, xp, title } });

    it('reads only the title, the xp and the spell states with the snapshot (D-07)', () => {
        expect(ACTIVE_SPELL_SNAPSHOT_PROJECTION).toEqual({
            'status.xp': 1,
            'status.title': 1,
            'status.spellStates': 1,
        });
    });

    it.each([
        [
            'SPELL_NOT_KNOWN',
            'equipping a spell without a spell state',
            () =>
                classifyEquipSpellFailure(
                    snapshot([entry(other, true)], 40000, TitleType.mage),
                    s,
                ),
        ],
        [
            'SPELL_ALREADY_ACTIVE',
            'equipping a spell whose state is active',
            () =>
                classifyEquipSpellFailure(
                    snapshot([entry(s, true)], 40000, TitleType.mage),
                    s,
                ),
        ],
        [
            'MAX_ACTIVE_SPELLS_REACHED',
            'equipping with as many active states as slots',
            () =>
                classifyEquipSpellFailure(
                    snapshot(
                        [entry(other, true), entry(s, false)],
                        20000,
                        TitleType.mage,
                    ),
                    s,
                ),
        ],
        [
            'SPELL_NOT_ACTIVE',
            'using a known spell whose state is not active',
            () => classifyUseSpellFailure(snapshot([entry(s, false)]), s),
        ],
        [
            'SPELL_NO_USAGES_LEFT',
            'using an active spell without usages',
            () => classifyUseSpellFailure(snapshot([entry(s, true, 0)]), s),
        ],
    ])('answers %s when %s (D-07)', (code, _, classify) => {
        expect(classify()).toMatchObject({ code });
    });

    describe('classifyEquipSpellFailure', () => {
        it('answers NOT_FOUND for a missing character', () => {
            expect(classifyEquipSpellFailure(null, s)).toMatchObject({
                code: 'NOT_FOUND',
            });
        });

        it('answers SPELL_NOT_KNOWN before every other refusal', () => {
            expect(classifyEquipSpellFailure(snapshot([]), s)).toMatchObject({
                code: 'SPELL_NOT_KNOWN',
            });
        });

        it('answers SPELL_ALREADY_ACTIVE before the capacity refusal', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([entry(s, true)], 20000, TitleType.mage),
                    s,
                ),
            ).toMatchObject({ code: 'SPELL_ALREADY_ACTIVE' });
        });

        it('counts only the active states against the slots of the xp tier', () => {
            const third = new Types.ObjectId();

            expect(
                classifyEquipSpellFailure(
                    snapshot(
                        [entry(other, true), entry(third), entry(s, false)],
                        25000,
                        TitleType.mage,
                    ),
                    s,
                ),
            ).toBeUndefined();
            expect(
                classifyEquipSpellFailure(
                    snapshot(
                        [
                            entry(other, true),
                            entry(third, true),
                            entry(s, false),
                        ],
                        25000,
                        TitleType.mage,
                    ),
                    s,
                ),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
        });

        it('answers MAX_ACTIVE_SPELLS_REACHED below the mage rank whatever the xp', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([entry(s, false)], 40000, TitleType.rookie),
                    s,
                ),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
            expect(
                classifyEquipSpellFailure(snapshot([entry(s, false)]), s),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
        });

        it('returns undefined when no guard is violated (state changed after the write)', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([entry(s, false)], 20000, TitleType.mage),
                    s,
                ),
            ).toBeUndefined();
        });

        it('reads a spell state stored without the flag as not active', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([entry(other), entry(s)], 20000, TitleType.mage),
                    s,
                ),
            ).toBeUndefined();
        });

        it('recognises a spell state stored with a legacy string id', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([entry(s.toHexString(), true)]),
                    s,
                ),
            ).toMatchObject({ code: 'SPELL_ALREADY_ACTIVE' });
        });
    });

    describe('classifyUnequipSpellFailure', () => {
        it('answers NOT_FOUND for a missing character', () => {
            expect(classifyUnequipSpellFailure(null)).toMatchObject({
                code: 'NOT_FOUND',
            });
        });

        it('answers SPELL_NOT_ACTIVE for any snapshot', () => {
            expect(
                classifyUnequipSpellFailure(snapshot([entry(s, true)])),
            ).toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });
    });

    describe('classifyUseSpellFailure', () => {
        it('answers NOT_FOUND for a missing character', () => {
            expect(classifyUseSpellFailure(null, s)).toMatchObject({
                code: 'NOT_FOUND',
            });
        });

        it('answers SPELL_NOT_ACTIVE for a spell without a spell state', () => {
            expect(
                classifyUseSpellFailure(snapshot([entry(other, true)]), s),
            ).toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });

        it('answers SPELL_NOT_ACTIVE for a state stored without the flag, whatever its usages', () => {
            expect(
                classifyUseSpellFailure(snapshot([entry(s)]), s),
            ).toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });

        it('answers SPELL_NOT_ACTIVE before SPELL_NO_USAGES_LEFT', () => {
            expect(
                classifyUseSpellFailure(snapshot([entry(s, false, 0)]), s),
            ).toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });

        it('answers SPELL_NO_USAGES_LEFT for an active state stored without usages', () => {
            const withoutUsages: SpellStateEntry = { spell: s, active: true };

            expect(
                classifyUseSpellFailure(snapshot([withoutUsages]), s),
            ).toMatchObject({ code: 'SPELL_NO_USAGES_LEFT' });
        });

        it('returns undefined when the active state still holds usages (state changed after the write)', () => {
            expect(
                classifyUseSpellFailure(snapshot([entry(s, true, 2)]), s),
            ).toBeUndefined();
        });
    });

    it('treats a missing list of spell states as empty', () => {
        const bare: ActiveSpellSnapshot = { status: {} };

        expect(classifyEquipSpellFailure(bare, s)).toMatchObject({
            code: 'SPELL_NOT_KNOWN',
        });
        expect(classifyEquipSpellFailure({}, s)).toMatchObject({
            code: 'SPELL_NOT_KNOWN',
        });
        expect(classifyUseSpellFailure(bare, s)).toMatchObject({
            code: 'SPELL_NOT_ACTIVE',
        });
        expect(classifyUnequipSpellFailure(bare)).toMatchObject({
            code: 'SPELL_NOT_ACTIVE',
        });
    });
});
