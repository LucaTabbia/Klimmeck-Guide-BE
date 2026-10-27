import { Types } from 'mongoose';
import {
    CREDIT_DUE_USAGE,
    CREDIT_LEGACY_USAGE,
    dueCreditFilter,
    legacyCreditFilter,
    spellStateArrayFilters,
    spendUsagesUpdate,
    useSpellFilter,
} from './spell-state.updates';

describe('spell state write builders', () => {
    const c = new Types.ObjectId();
    const s = new Types.ObjectId();
    const forms = [s, s.toHexString()];

    it('spellStateArrayFilters targets the cast state entry and the mirror stored in either id form', () => {
        const options = spellStateArrayFilters(s);

        expect(options).toEqual({
            arrayFilters: [{ 's.spell': s }, { 'a.spell': { $in: forms } }],
        });
        expect(options.arrayFilters[0]['s.spell']).toBeInstanceOf(
            Types.ObjectId,
        );
    });

    it('useSpellFilter requires the spell to be active with at least one usage in its state', () => {
        expect(useSpellFilter(c, s)).toEqual({
            _id: c,
            deletedAt: null,
            'assets.activeSpells.spell': { $in: forms },
            'status.spellStates': {
                $elemMatch: { spell: s, usages: { $gte: 1 } },
            },
        });
    });

    it('spendUsagesUpdate spends one usage per instant on state and mirror, pushing sorted instants', () => {
        const d1 = new Date(2_000);
        const d2 = new Date(1_000);

        expect(spendUsagesUpdate([d1, d2])).toEqual({
            $inc: {
                'status.spellStates.$[s].usages': -2,
                'assets.activeSpells.$[a].usages': -2,
            },
            $push: {
                'status.spellStates.$[s].recoveries': {
                    $each: [d1, d2],
                    $sort: 1,
                },
            },
        });
    });

    it('spendUsagesUpdate copies the instants instead of sharing the caller array', () => {
        const instants = [new Date(1_000)];

        const update = spendUsagesUpdate(instants);

        expect(
            update.$push['status.spellStates.$[s].recoveries'].$each,
        ).not.toBe(instants);
    });

    it('spendUsagesUpdate refuses an empty list of instants', () => {
        expect(() => spendUsagesUpdate([])).toThrow(
            new Error('spendUsagesUpdate requires at least one instant'),
        );
    });

    it('«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata»: the due credit never requires the spell to be active', () => {
        const now = new Date(5_000);

        const filter = dueCreditFilter(c, s, 3, now);

        expect(filter).toEqual({
            _id: c,
            deletedAt: null,
            'status.spellStates': {
                $elemMatch: {
                    spell: s,
                    usages: { $lt: 3 },
                    'recoveries.0': { $lte: now },
                },
            },
        });
        expect(Object.keys(filter).sort()).toEqual(
            ['_id', 'deletedAt', 'status.spellStates'].sort(),
        );
    });

    it('«Il timer di recupero non si interrompe mai»: the due credit returns one usage and consumes the oldest instant', () => {
        expect(CREDIT_DUE_USAGE).toEqual({
            $inc: {
                'status.spellStates.$[s].usages': 1,
                'assets.activeSpells.$[a].usages': 1,
            },
            $pop: { 'status.spellStates.$[s].recoveries': -1 },
        });
    });

    it('legacyCreditFilter credits only the untracked deficit of a known spell', () => {
        expect(legacyCreditFilter(c, s, 3)).toEqual({
            _id: c,
            deletedAt: null,
            $expr: {
                $let: {
                    vars: {
                        state: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: {
                                            $ifNull: [
                                                '$status.spellStates',
                                                [],
                                            ],
                                        },
                                        cond: { $eq: ['$$this.spell', s] },
                                    },
                                },
                                0,
                            ],
                        },
                    },
                    in: {
                        $and: [
                            { $ne: [{ $ifNull: ['$$state', null] }, null] },
                            {
                                $lt: [
                                    {
                                        $add: [
                                            '$$state.usages',
                                            {
                                                $size: {
                                                    $ifNull: [
                                                        '$$state.recoveries',
                                                        [],
                                                    ],
                                                },
                                            },
                                        ],
                                    },
                                    3,
                                ],
                            },
                        ],
                    },
                },
            },
        });
    });

    it('CREDIT_LEGACY_USAGE returns one usage and leaves the instants untouched', () => {
        expect(CREDIT_LEGACY_USAGE).toEqual({
            $inc: {
                'status.spellStates.$[s].usages': 1,
                'assets.activeSpells.$[a].usages': 1,
            },
        });
    });
});
