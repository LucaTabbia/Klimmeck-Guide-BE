import { Types } from 'mongoose';
import { maxActiveSpellsExpression } from 'src/models/character/active-spell-slots';
import {
    ActiveSpellSnapshot,
    classifyEquipSpellFailure,
    classifyUnequipSpellFailure,
    classifyUseSpellFailure,
    DECREMENT_ACTIVE_SPELL_USAGE,
    equipSpellFilter,
    equipSpellUpdate,
    INCREMENT_ACTIVE_SPELL_USAGE,
    recoverSpellFilter,
    unequipSpellFilter,
    unequipSpellUpdate,
    useSpellFilter,
} from './active-spell.updates';

describe('active spell write builders', () => {
    const c = new Types.ObjectId();
    const s = new Types.ObjectId();

    it('equipSpellFilter guards knowledge, uniqueness and live capacity', () => {
        const filter = equipSpellFilter(c, s);

        expect(filter).toEqual({
            _id: c,
            deletedAt: null,
            'status.spells': s,
            'assets.activeSpells.spell': { $ne: s },
            $expr: {
                $lt: [
                    { $size: { $ifNull: ['$assets.activeSpells', []] } },
                    maxActiveSpellsExpression(),
                ],
            },
        });
        expect(filter._id).toBeInstanceOf(Types.ObjectId);
        expect(filter['status.spells']).toBeInstanceOf(Types.ObjectId);
    });

    it('equipSpellUpdate pushes the spell with the given usages', () => {
        expect(equipSpellUpdate(s, 3)).toEqual({
            $push: { 'assets.activeSpells': { spell: s, usages: 3 } },
        });
    });

    it('unequipSpellFilter / unequipSpellUpdate pull an active spell', () => {
        expect(unequipSpellFilter(c, s)).toEqual({
            _id: c,
            deletedAt: null,
            'assets.activeSpells.spell': s,
        });
        expect(unequipSpellUpdate(s)).toEqual({
            $pull: { 'assets.activeSpells': { spell: s } },
        });
    });

    it('useSpellFilter requires at least one usage left', () => {
        expect(useSpellFilter(c, s)).toEqual({
            _id: c,
            deletedAt: null,
            'assets.activeSpells': {
                $elemMatch: { spell: s, usages: { $gte: 1 } },
            },
        });
    });

    it('recoverSpellFilter never exceeds the catalog maximum', () => {
        expect(recoverSpellFilter(c, s, 3)).toEqual({
            _id: c,
            deletedAt: null,
            'assets.activeSpells': {
                $elemMatch: { spell: s, usages: { $lt: 3 } },
            },
        });
    });

    it('exposes positional usage increments', () => {
        expect(DECREMENT_ACTIVE_SPELL_USAGE).toEqual({
            $inc: { 'assets.activeSpells.$.usages': -1 },
        });
        expect(INCREMENT_ACTIVE_SPELL_USAGE).toEqual({
            $inc: { 'assets.activeSpells.$.usages': 1 },
        });
    });
});

describe('active spell failure classifiers', () => {
    const s = new Types.ObjectId();
    const snapshot = (
        spells: unknown[],
        activeSpells: { spell?: unknown; usages?: number }[],
    ): ActiveSpellSnapshot => ({
        status: { spells },
        assets: { activeSpells },
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

        it('fails closed with MAX_ACTIVE_SPELLS_REACHED when no guard looks violated', () => {
            expect(
                classifyEquipSpellFailure(snapshot([s], []), s),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
        });

        it('recognises a legacy string id as known', () => {
            expect(
                classifyEquipSpellFailure(snapshot([s.toHexString()], []), s),
            ).toMatchObject({ code: 'MAX_ACTIVE_SPELLS_REACHED' });
        });
    });

    describe('classifyUnequipSpellFailure', () => {
        it('answers NOT_FOUND for a missing character', () => {
            expect(classifyUnequipSpellFailure(null, s)).toMatchObject({
                code: 'NOT_FOUND',
            });
        });

        it('answers SPELL_NOT_ACTIVE for any snapshot', () => {
            expect(
                classifyUnequipSpellFailure(
                    snapshot([s], [{ spell: s, usages: 1 }]),
                    s,
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

        it.each([0, 1])(
            'answers SPELL_NO_USAGES_LEFT for an active spell with %p usages',
            (usages) => {
                expect(
                    classifyUseSpellFailure(
                        snapshot([s], [{ spell: s, usages }]),
                        s,
                    ),
                ).toMatchObject({ code: 'SPELL_NO_USAGES_LEFT' });
            },
        );
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
        expect(classifyUnequipSpellFailure(bare, s)).toMatchObject({
            code: 'SPELL_NOT_ACTIVE',
        });
    });
});
