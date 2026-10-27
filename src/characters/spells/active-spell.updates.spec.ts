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

describe('active spell write builders', () => {
    const c = new Types.ObjectId();
    const s = new Types.ObjectId();

    const forms = [s, s.toHexString()];

    it('equipSpellFilter guards knowledge, uniqueness and live capacity on either id form', () => {
        const filter = equipSpellFilter(c, s);

        expect(filter).toEqual({
            _id: c,
            deletedAt: null,
            'status.spells': { $in: forms },
            'assets.activeSpells.spell': { $nin: forms },
            $expr: {
                $lt: [
                    { $size: { $ifNull: ['$assets.activeSpells', []] } },
                    maxActiveSpellsExpression(),
                ],
            },
        });
        expect(filter._id).toBeInstanceOf(Types.ObjectId);
        expect(filter['status.spells'].$in[0]).toBeInstanceOf(Types.ObjectId);
    });

    it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: equipSpellUpdate copies the usages of the spell state into the slot', () => {
        const update = equipSpellUpdate(s, 3);

        expect(update).toEqual([
            {
                $set: {
                    'assets.activeSpells': {
                        $concatArrays: [
                            { $ifNull: ['$assets.activeSpells', []] },
                            [
                                {
                                    spell: s,
                                    usages: {
                                        $ifNull: [
                                            {
                                                $let: {
                                                    vars: {
                                                        state: {
                                                            $arrayElemAt: [
                                                                {
                                                                    $filter: {
                                                                        input: {
                                                                            $ifNull:
                                                                                [
                                                                                    '$status.spellStates',
                                                                                    [],
                                                                                ],
                                                                        },
                                                                        cond: {
                                                                            $eq: [
                                                                                '$$this.spell',
                                                                                s,
                                                                            ],
                                                                        },
                                                                    },
                                                                },
                                                                0,
                                                            ],
                                                        },
                                                    },
                                                    in: '$$state.usages',
                                                },
                                            },
                                            3,
                                        ],
                                    },
                                },
                            ],
                        ],
                    },
                },
            },
        ]);
        expect(Array.isArray(update)).toBe(true);
        expect(update).toMatchObject([
            {
                $set: {
                    'assets.activeSpells': {
                        $concatArrays: [
                            expect.anything(),
                            [{ spell: expect.any(Types.ObjectId) }],
                        ],
                    },
                },
            },
        ]);
    });

    it('unequipSpellFilter / unequipSpellUpdate pull an active spell stored in either id form', () => {
        expect(unequipSpellFilter(c, s)).toEqual({
            _id: c,
            deletedAt: null,
            'assets.activeSpells.spell': { $in: forms },
        });
        expect(unequipSpellUpdate(s)).toEqual({
            $pull: { 'assets.activeSpells': { spell: { $in: forms } } },
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
    const snapshot = (
        spells: unknown[],
        activeSpells: { spell?: unknown; usages?: number }[],
        xp?: number,
        title?: TitleType,
    ): ActiveSpellSnapshot => ({
        status: { spells, xp, title },
        assets: { activeSpells },
    });

    const useSnapshot = (
        activeSpells: { spell?: unknown; usages?: number }[],
        usages: number | undefined,
    ): ActiveSpellSnapshot => ({
        status: {
            spells: [s],
            spellStates: [{ spell: s, usages, recoveries: [] }],
        },
        assets: { activeSpells },
    });

    it('reads the title and the spell state with the snapshot', () => {
        expect(ACTIVE_SPELL_SNAPSHOT_PROJECTION).toEqual({
            'status.spells': 1,
            'status.xp': 1,
            'status.title': 1,
            'status.spellStates': 1,
            'assets.activeSpells': 1,
        });
    });

    describe('classifyEquipSpellFailure', () => {
        it('answers NOT_FOUND for a missing character', () => {
            expect(classifyEquipSpellFailure(null, s)).toMatchObject({
                code: 'NOT_FOUND',
            });
        });

        it('answers SPELL_NOT_KNOWN for an unknown spell', () => {
            expect(
                classifyEquipSpellFailure(snapshot([], []), s),
            ).toMatchObject({ code: 'SPELL_NOT_KNOWN' });
        });

        it('answers SPELL_ALREADY_ACTIVE for an active spell', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([s], [{ spell: s, usages: 1 }]),
                    s,
                ),
            ).toMatchObject({ code: 'SPELL_ALREADY_ACTIVE' });
        });

        it('answers MAX_ACTIVE_SPELLS_REACHED when every slot of the xp tier is taken', () => {
            const other = new Types.ObjectId();

            expect(
                classifyEquipSpellFailure(snapshot([s], []), s),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
            expect(
                classifyEquipSpellFailure(
                    snapshot([s, other], [{ spell: other, usages: 1 }], 20000),
                    s,
                ),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
        });

        it('answers MAX_ACTIVE_SPELLS_REACHED below the mage rank whatever the xp', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([s], [], 40000, TitleType.rookie),
                    s,
                ),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
        });

        it('returns undefined when no guard is violated (state changed after the write)', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([s], [], 20000, TitleType.mage),
                    s,
                ),
            ).toBeUndefined();
        });

        it('recognises a legacy string id as active', () => {
            expect(
                classifyEquipSpellFailure(
                    snapshot([s], [{ spell: s.toHexString(), usages: 1 }]),
                    s,
                ),
            ).toMatchObject({ code: 'SPELL_ALREADY_ACTIVE' });
        });

        it('recognises a legacy string id as known', () => {
            expect(
                classifyEquipSpellFailure(snapshot([s.toHexString()], []), s),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
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
                classifyUnequipSpellFailure(
                    snapshot([s], [{ spell: s, usages: 1 }]),
                ),
            ).toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });
    });

    describe('classifyUseSpellFailure', () => {
        it('answers NOT_FOUND for a missing character', () => {
            expect(classifyUseSpellFailure(null, s)).toMatchObject({
                code: 'NOT_FOUND',
            });
        });

        it('answers SPELL_NOT_ACTIVE when the spell is not active', () => {
            expect(classifyUseSpellFailure(snapshot([s], []), s)).toMatchObject(
                { code: 'SPELL_NOT_ACTIVE' },
            );
        });

        it('answers SPELL_NOT_ACTIVE for a known spell with usages in its state but out of the slots', () => {
            expect(
                classifyUseSpellFailure(useSnapshot([], 3), s),
            ).toMatchObject({ code: 'SPELL_NOT_ACTIVE' });
        });

        it.each([0, undefined])(
            'answers SPELL_NO_USAGES_LEFT for an active spell with %p usages in its state',
            (usages) => {
                expect(
                    classifyUseSpellFailure(
                        useSnapshot([{ spell: s, usages: 3 }], usages),
                        s,
                    ),
                ).toMatchObject({ code: 'SPELL_NO_USAGES_LEFT' });
            },
        );

        it('answers SPELL_NO_USAGES_LEFT for an active spell without a spell state entry', () => {
            expect(
                classifyUseSpellFailure(
                    snapshot([s], [{ spell: s, usages: 3 }]),
                    s,
                ),
            ).toMatchObject({ code: 'SPELL_NO_USAGES_LEFT' });
        });

        it('returns undefined when the spell state still holds usages, whatever the mirror says (state changed after the write)', () => {
            expect(
                classifyUseSpellFailure(
                    useSnapshot([{ spell: s.toHexString(), usages: 0 }], 2),
                    s,
                ),
            ).toBeUndefined();
        });
    });

    it('treats missing arrays as empty', () => {
        const bare: ActiveSpellSnapshot = { status: {}, assets: {} };

        expect(() => classifyEquipSpellFailure(bare, s)).not.toThrow();
        expect(classifyEquipSpellFailure(bare, s)).toMatchObject({
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
